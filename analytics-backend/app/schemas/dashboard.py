"""Part 1 §1.2 Tier 1 headline metrics — the six cards `dashboard-page.tsx`'s
`PLACEHOLDER_METRICS` array already reserves space for."""

from datetime import date

from app.schemas.common import CamelModel


class DashboardSummary(CamelModel):
    range_start: date
    range_end: date
    sessions: int
    pageviews: int
    bounce_rate: float  # 0..1
    avg_session_duration_seconds: float
    views_per_session: float
    visitors_approx: int
    # Part 1 §1.7 / Action A-07: true whenever the range spans more than one
    # property-local day, because `visitors_approx` is then a sum of daily
    # exact-unique counts, not a true multi-day unique-people count (no HLL
    # merge yet — Part 3 §3.7). The frontend must render a caveat, not a bare
    # number, whenever this is true.
    is_visitors_approximate: bool
