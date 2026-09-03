"""Part 3 §3.3, Rule R-01 — all SQL against `analytics.events_raw` lives here.

D-14: `analytics.*` is accessed via SQLAlchemy Core (`text()`), not the ORM —
there is no mapped `Event` class, and there should not be one; this table is
never read or written row-by-row through an identity map.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_INSERT_EVENT = text(
    """
    INSERT INTO analytics.events_raw (
        event_id, property_id, received_at, occurred_at, event_name,
        session_id, visitor_hash, user_id,
        page_path, page_query, page_hostname, page_title,
        referrer_domain, referrer_path,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content, channel_group,
        device_type, browser_name, browser_version, os_name, os_version,
        screen_width, viewport_width,
        country_code, region_code, city_geoname_id,
        is_bot, clock_skew, properties
    ) VALUES (
        :event_id, :property_id, :received_at, :occurred_at, :event_name,
        :session_id, :visitor_hash, :user_id,
        :page_path, :page_query, :page_hostname, :page_title,
        :referrer_domain, :referrer_path,
        :utm_source, :utm_medium, :utm_campaign, :utm_term, :utm_content, :channel_group,
        :device_type, :browser_name, :browser_version, :os_name, :os_version,
        :screen_width, :viewport_width,
        :country_code, :region_code, :city_geoname_id,
        :is_bot, :clock_skew, CAST(:properties AS jsonb)
    )
    ON CONFLICT (property_id, received_at, event_id) DO NOTHING
    """
)

_LAST_EVENT_FOR_VISITOR = text(
    """
    SELECT session_id, occurred_at, utm_source, utm_medium
    FROM analytics.events_raw
    WHERE property_id = :property_id
      AND visitor_hash = :visitor_hash
      AND received_at >= :since
    ORDER BY occurred_at DESC
    LIMIT 1
    """
)


@dataclass(frozen=True)
class LastVisitorEvent:
    session_id: str
    occurred_at: datetime
    utm_source: str | None
    utm_medium: str | None


class EventRepository:
    """Phase 1 writes go straight to Postgres, one row per event — no
    in-process batch buffer, no Redis Stream, no `COPY` (D-06's B+C design,
    docs/architecture/05-ingestion-pipeline.md §5.3). `ON CONFLICT DO NOTHING`
    on the partition-key-inclusive primary key is the Part 1 §1.9 dedup
    backstop; Redis dedup (`RealtimeRepository.claim_event_id`) handles the
    common case before a row is even built.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert(self, **fields: object) -> None:
        await self._session.execute(_INSERT_EVENT, fields)

    async def get_last_event_for_visitor(
        self, *, property_id: int, visitor_hash: bytes, since: datetime
    ) -> LastVisitorEvent | None:
        """Session-cache-miss fallback (Part 1 §1.6 / §2.4 step 7): when Redis
        has no last-seen entry for this visitor (cold cache, first event after
        a Redis restart), reconstruct enough state from `events_raw` to decide
        continue-vs-new-session. `since` should be `now - session_timeout`;
        Phase 1 has no batch sessionizer, so this raw-event fallback is the
        only source of truth besides the cache."""
        result = await self._session.execute(
            _LAST_EVENT_FOR_VISITOR,
            {"property_id": property_id, "visitor_hash": visitor_hash, "since": since},
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None
        return LastVisitorEvent(
            session_id=str(row["session_id"]),
            occurred_at=row["occurred_at"],
            utm_source=row["utm_source"],
            utm_medium=row["utm_medium"],
        )
