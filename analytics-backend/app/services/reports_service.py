"""Part 4 §4.9 — the query-composition layer for Tier-1 reports and the
dashboard summary. Both read paths share the same "last N days, property-
local" window, where N is `analytics.raw_query_range_cap_days` — Phase 1 has
no date-range picker and no rollups to serve a longer range from, so the one
range the raw-event repository can safely answer is the one both pages
already show ("Last 7 days" in `dashboard-page.tsx` / `reports-page.tsx`).
"""

from app.core.config import Settings
from app.core.types import ReportDimension
from app.models.core.property import Property
from app.repositories.reports_repo import ReportsRepository
from app.schemas.dashboard import DashboardSummary
from app.schemas.reports import ReportRow
from app.utils.time import last_n_days_local, received_at_window


class ReportsService:
    def __init__(self, repo: ReportsRepository, settings: Settings) -> None:
        self._repo = repo
        self._settings = settings

    async def get_breakdown(
        self, *, property_: Property, dimension: ReportDimension
    ) -> list[ReportRow]:
        local_range = last_n_days_local(
            timezone=property_.timezone, days=self._settings.analytics.raw_query_range_cap_days
        )
        window = received_at_window(local_range.start_utc, local_range.end_utc)
        rows = await self._repo.dimension_breakdown(
            property_id=property_.id,
            dimension=dimension,
            received_from=window.start,
            received_to=window.end,
            occurred_from=local_range.start_utc,
            occurred_to=local_range.end_utc,
        )
        return [
            ReportRow(
                dimension_value=row.dimension_value,
                sessions=row.sessions,
                pageviews=row.pageviews,
                bounce_rate=row.bounce_rate,
            )
            for row in rows
        ]

    async def get_dashboard_summary(self, *, property_: Property) -> DashboardSummary:
        local_range = last_n_days_local(
            timezone=property_.timezone, days=self._settings.analytics.raw_query_range_cap_days
        )
        window = received_at_window(local_range.start_utc, local_range.end_utc)
        totals = await self._repo.dashboard_totals(
            property_id=property_.id,
            received_from=window.start,
            received_to=window.end,
            occurred_from=local_range.start_utc,
            occurred_to=local_range.end_utc,
            timezone=property_.timezone,
        )
        views_per_session = (totals.pageviews / totals.sessions) if totals.sessions else 0.0
        return DashboardSummary(
            range_start=local_range.start_date,
            range_end=local_range.end_date,
            sessions=totals.sessions,
            pageviews=totals.pageviews,
            bounce_rate=totals.bounce_rate,
            avg_session_duration_seconds=totals.avg_session_duration_seconds,
            views_per_session=views_per_session,
            visitors_approx=totals.visitors_approx,
            is_visitors_approximate=local_range.end_date > local_range.start_date,
        )
