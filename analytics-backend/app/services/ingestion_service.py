"""Part 2 §2.4 "Write path in detail" — the collector pipeline.

Phase 1 runs every step synchronously against Postgres for one event at a
time: no in-process batch buffer, no `COPY`, no Redis Stream, no realtime-
indexer worker (D-06's B+C design and the arq workers are Phase 2 — see
docs/architecture/05-ingestion-pipeline.md). What's implemented is steps
1-8 of §2.4 in full — validate, resolve property, bot filter, dedup, enrich,
derive the visitor hash, resolve the session — plus a direct insert in place
of step 9's buffer append, and updating the same Redis realtime index the
documented realtime indexer would otherwise maintain from the stream.

Owns its own transaction boundary (D-16): one event is one `INSERT`, so the
"transaction" is the statement itself, but the commit still happens here, not
in the repository.
"""

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.repositories.event_repo import EventRepository
from app.repositories.property_repo import PropertyRepository
from app.repositories.realtime_repo import RealtimeRepository, SessionState
from app.schemas.event import CollectorEventRequest
from app.utils.bot_filter import is_bot
from app.utils.channel import classify_channel
from app.utils.geoip import lookup_country
from app.utils.url import parse_page_url, parse_referrer_url
from app.utils.user_agent import parse_user_agent
from app.utils.visitor_hash import compute_visitor_hash, derive_daily_salt

logger = structlog.get_logger(__name__)

_CLOCK_SKEW_TOLERANCE = timedelta(hours=24)


def _clamp_occurred_at(raw: str, received_at: datetime) -> tuple[datetime, bool]:
    try:
        occurred_at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=UTC)
    except ValueError:
        return received_at, True
    if abs(occurred_at - received_at) > _CLOCK_SKEW_TOLERANCE:
        return received_at, True
    return occurred_at, False


class IngestionService:
    def __init__(
        self, session: AsyncSession, redis_repo: RealtimeRepository, settings: Settings
    ) -> None:
        self._session = session
        self._events = EventRepository(session)
        self._properties = PropertyRepository(session)
        self._realtime = redis_repo
        self._settings = settings

    async def ingest(
        self, payload: CollectorEventRequest, *, client_ip: str, user_agent: str
    ) -> None:
        """Never raises for an expected "reject silently" case (Part 2 §2.5)
        — the collector always returns 204 regardless of what happened here.
        Only a genuinely unexpected error propagates, and even that becomes a
        204 at the collector layer (with the exception logged)."""
        prop = await self._properties.get_by_tracking_id(payload.tracking_id)
        if prop is None:
            logger.info("collector_dropped", reason="unknown_tracking_id")
            return

        if prop.bot_filtering and is_bot(user_agent):
            logger.debug("collector_dropped", reason="bot", property_id=prop.id)
            return

        if not await self._realtime.claim_event_id(payload.event_id):
            logger.debug("collector_dropped", reason="duplicate", property_id=prop.id)
            return

        received_at = datetime.now(UTC)
        occurred_at, clock_skew = _clamp_occurred_at(payload.occurred_at, received_at)

        page_ctx = parse_page_url(payload.page_url)
        referrer_ctx = parse_referrer_url(payload.referrer_url, page_ctx.hostname)
        ua_info = parse_user_agent(user_agent)
        country_code = lookup_country(client_ip, self._settings)
        channel_group = classify_channel(
            utm_source=page_ctx.utm_source,
            utm_medium=page_ctx.utm_medium,
            referrer_domain=referrer_ctx.domain,
        )

        tz = ZoneInfo(prop.timezone)
        local_date = occurred_at.astimezone(tz).date()

        daily_salt = derive_daily_salt(
            master_secret=self._settings.security.visitor_hash_secret,
            property_id=prop.id,
            local_date=local_date,
        )
        visitor_hash = compute_visitor_hash(
            daily_salt=daily_salt,
            property_id=prop.id,
            client_ip=client_ip,
            user_agent=user_agent,
        )
        visitor_hash_hex = visitor_hash.hex()

        session_id = await self._resolve_session(
            property_id=prop.id,
            visitor_hash=visitor_hash,
            visitor_hash_hex=visitor_hash_hex,
            occurred_at=occurred_at,
            local_date=local_date,
            tz=tz,
            utm_source=page_ctx.utm_source or "",
            utm_medium=page_ctx.utm_medium or "",
            timeout_minutes=self._settings.ingestion.session_timeout_minutes,
        )

        await self._events.insert(
            event_id=uuid.UUID(payload.event_id),
            property_id=prop.id,
            received_at=received_at,
            occurred_at=occurred_at,
            event_name=payload.event_name,
            session_id=uuid.UUID(session_id),
            visitor_hash=visitor_hash,
            user_id=None,
            page_path=page_ctx.path,
            page_query=page_ctx.query,
            page_hostname=page_ctx.hostname,
            page_title=None,
            referrer_domain=referrer_ctx.domain,
            referrer_path=referrer_ctx.path,
            utm_source=page_ctx.utm_source,
            utm_medium=page_ctx.utm_medium,
            utm_campaign=page_ctx.utm_campaign,
            utm_term=page_ctx.utm_term,
            utm_content=page_ctx.utm_content,
            channel_group=channel_group,
            device_type=ua_info.device_type,
            browser_name=ua_info.browser_name,
            browser_version=ua_info.browser_version,
            os_name=ua_info.os_name,
            os_version=ua_info.os_version,
            screen_width=payload.screen_width,
            viewport_width=payload.viewport_width,
            country_code=country_code,
            region_code=None,
            city_geoname_id=None,
            is_bot=False,
            clock_skew=clock_skew,
            properties=json.dumps(payload.properties) if payload.properties else None,
        )
        await self._session.commit()

        await self._realtime.set_session_state(
            property_id=prop.id,
            visitor_hash_hex=visitor_hash_hex,
            state=SessionState(
                session_id=session_id,
                started_at=occurred_at.isoformat(),
                last_seen_epoch=occurred_at.timestamp(),
                local_date=local_date.isoformat(),
                utm_source=page_ctx.utm_source or "",
                utm_medium=page_ctx.utm_medium or "",
                page_path=page_ctx.path or "",
                country_code=country_code or "",
            ),
            ttl_seconds=self._settings.ingestion.session_timeout_minutes * 60,
        )

    async def _resolve_session(
        self,
        *,
        property_id: int,
        visitor_hash: bytes,
        visitor_hash_hex: str,
        occurred_at: datetime,
        local_date: date,
        tz: ZoneInfo,
        utm_source: str,
        utm_medium: str,
        timeout_minutes: int,
    ) -> str:
        """Part 1 §1.6 — a new session starts on no prior event, a >=30 min
        gap, a property-local midnight crossing, or a campaign change.
        Reads the Redis session cache first; on a cache miss, falls back to
        one indexed query against `events_raw` (Phase 1 has no batch
        sessionizer to correct drift, so this fallback path is load-bearing,
        not just an optimization detail)."""
        cached = await self._realtime.get_session_state(
            property_id=property_id, visitor_hash_hex=visitor_hash_hex
        )
        if cached is not None:
            gap = occurred_at.timestamp() - cached.last_seen_epoch
            campaign_changed = bool(utm_source) and (
                utm_source != cached.utm_source or utm_medium != cached.utm_medium
            )
            if (
                gap < timeout_minutes * 60
                and local_date.isoformat() == cached.local_date
                and not campaign_changed
            ):
                return cached.session_id
            return str(uuid.uuid4())

        since = occurred_at - timedelta(minutes=timeout_minutes)
        last = await self._events.get_last_event_for_visitor(
            property_id=property_id, visitor_hash=visitor_hash, since=since
        )
        if last is None:
            return str(uuid.uuid4())

        gap = (occurred_at - last.occurred_at).total_seconds()
        campaign_changed = bool(utm_source) and (
            utm_source != (last.utm_source or "") or utm_medium != (last.utm_medium or "")
        )
        same_local_date = last.occurred_at.astimezone(tz).date() == local_date
        if gap < timeout_minutes * 60 and same_local_date and not campaign_changed:
            return last.session_id
        return str(uuid.uuid4())
