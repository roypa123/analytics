"""Part 1 §1.11-§1.12, Rule R-01 — Tier-1 breakdown and summary queries.

Phase 1 has no `agg_daily_*` rollups (Part 3 §3.6) yet, so every query here
reads `analytics.events_raw` directly, range-capped by
`analytics.raw_query_range_cap_days` and pruned on `received_at` with the
Part 1 §1.10 slack window. That is exactly what Part 3 §3.5 says raw-event
queries are for: "a range-capped exploration query and a sequential scan of a
few partitions... is acceptable." Once real traffic makes a 7-day scan slow,
Part 3 §3.6's tiered rollups are the fix — this repository is the one place
that changes (D-07's exit-ramp reasoning, applied one level down).

There is also no `analytics.sessions` table yet (Part 3 §3.8) — session-level
facts (bounce rate, session counts) are derived per-query via `GROUP BY
session_id` over the capped window rather than read from a maintained table.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.types import ReportDimension

# Trusted, fixed SQL fragments keyed by a Literal validated before this
# module ever sees it (`app/core/types.py`) — never user-supplied text, so
# building the query string from this dict carries no injection risk.
_DIMENSION_SQL: dict[ReportDimension, tuple[str, str]] = {
    "pages": ("e.page_path", "e.page_path IS NOT NULL"),
    "referrers": ("e.referrer_domain", "e.referrer_domain IS NOT NULL"),
    "sources": (
        "CASE WHEN e.utm_source IS NULL THEN 'Direct' "
        "ELSE e.utm_source || ' / ' || COALESCE(e.utm_medium, '(none)') END",
        "TRUE",
    ),
    "locations": ("e.country_code", "e.country_code IS NOT NULL"),
    "devices": ("e.device_type", "e.device_type IS NOT NULL"),
    "browsers": ("e.browser_name", "e.browser_name IS NOT NULL"),
    "os": ("e.os_name", "e.os_name IS NOT NULL"),
}


@dataclass(frozen=True)
class DimensionRow:
    dimension_value: str
    sessions: int
    pageviews: int
    bounce_rate: float


@dataclass(frozen=True)
class DashboardTotals:
    sessions: int
    pageviews: int
    visitors_approx: int
    bounce_rate: float
    avg_session_duration_seconds: float


class ReportsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def dimension_breakdown(
        self,
        *,
        property_id: int,
        dimension: ReportDimension,
        received_from: datetime,
        received_to: datetime,
        occurred_from: datetime,
        occurred_to: datetime,
        limit: int = 50,
    ) -> list[DimensionRow]:
        dim_expr, dim_filter = _DIMENSION_SQL[dimension]
        query = text(
            f"""
            WITH session_totals AS (
                SELECT session_id, COUNT(*) FILTER (WHERE event_name = 'pageview') AS pv_count
                FROM analytics.events_raw
                WHERE property_id = :property_id
                  AND received_at >= :received_from AND received_at < :received_to
                  AND occurred_at >= :occurred_from AND occurred_at < :occurred_to
                  AND is_bot = false AND session_id IS NOT NULL
                GROUP BY session_id
            ),
            dim_events AS (
                SELECT e.session_id, ({dim_expr}) AS dim_value, st.pv_count
                FROM analytics.events_raw e
                JOIN session_totals st ON st.session_id = e.session_id
                WHERE e.property_id = :property_id
                  AND e.received_at >= :received_from AND e.received_at < :received_to
                  AND e.occurred_at >= :occurred_from AND e.occurred_at < :occurred_to
                  AND e.is_bot = false AND e.event_name = 'pageview'
                  AND ({dim_filter})
            )
            SELECT
                dim_value,
                COUNT(DISTINCT session_id) AS sessions,
                COUNT(*) AS pageviews,
                (COUNT(DISTINCT session_id) FILTER (WHERE pv_count = 1))::float
                    / NULLIF(COUNT(DISTINCT session_id), 0) AS bounce_rate
            FROM dim_events
            GROUP BY dim_value
            ORDER BY pageviews DESC
            LIMIT :limit
            """
        )
        result = await self._session.execute(
            query,
            {
                "property_id": property_id,
                "received_from": received_from,
                "received_to": received_to,
                "occurred_from": occurred_from,
                "occurred_to": occurred_to,
                "limit": limit,
            },
        )
        return [
            DimensionRow(
                dimension_value=row.dim_value,
                sessions=row.sessions,
                pageviews=row.pageviews,
                bounce_rate=row.bounce_rate or 0.0,
            )
            for row in result
        ]

    async def dashboard_totals(
        self,
        *,
        property_id: int,
        received_from: datetime,
        received_to: datetime,
        occurred_from: datetime,
        occurred_to: datetime,
        timezone: str,
    ) -> DashboardTotals:
        query = text(
            """
            WITH session_totals AS (
                SELECT
                    session_id,
                    COUNT(*) FILTER (WHERE event_name = 'pageview') AS pv_count,
                    MIN(occurred_at) AS started_at,
                    MAX(occurred_at) AS ended_at
                FROM analytics.events_raw
                WHERE property_id = :property_id
                  AND received_at >= :received_from AND received_at < :received_to
                  AND occurred_at >= :occurred_from AND occurred_at < :occurred_to
                  AND is_bot = false AND session_id IS NOT NULL
                GROUP BY session_id
            ),
            daily_visitors AS (
                SELECT
                    (occurred_at AT TIME ZONE :timezone)::date AS local_date,
                    COUNT(DISTINCT visitor_hash) AS uniques
                FROM analytics.events_raw
                WHERE property_id = :property_id
                  AND received_at >= :received_from AND received_at < :received_to
                  AND occurred_at >= :occurred_from AND occurred_at < :occurred_to
                  AND is_bot = false
                GROUP BY 1
            )
            SELECT
                (SELECT COUNT(*) FROM session_totals) AS sessions,
                (SELECT COALESCE(SUM(pv_count), 0) FROM session_totals) AS pageviews,
                (SELECT COALESCE(SUM(uniques), 0) FROM daily_visitors) AS visitors_approx,
                (SELECT (COUNT(*) FILTER (WHERE pv_count = 1))::float / NULLIF(COUNT(*), 0)
                 FROM session_totals) AS bounce_rate,
                (SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))
                 FROM session_totals) AS avg_session_duration_seconds
            """
        )
        result = await self._session.execute(
            query,
            {
                "property_id": property_id,
                "received_from": received_from,
                "received_to": received_to,
                "occurred_from": occurred_from,
                "occurred_to": occurred_to,
                "timezone": timezone,
            },
        )
        row = result.one()
        return DashboardTotals(
            sessions=row.sessions,
            pageviews=row.pageviews,
            visitors_approx=row.visitors_approx,
            bounce_rate=row.bounce_rate or 0.0,
            avg_session_duration_seconds=row.avg_session_duration_seconds or 0.0,
        )
