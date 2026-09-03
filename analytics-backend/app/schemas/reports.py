"""Part 1 §1.11-§1.12 — one row per dimension value, the shape the frontend's
`reports-page.tsx` breakdown table (`METRIC_COLUMNS = ["Sessions",
"Pageviews", "Bounce rate"]`) already expects."""

from app.schemas.common import CamelModel


class ReportRow(CamelModel):
    dimension_value: str
    sessions: int
    pageviews: int
    bounce_rate: float  # 0..1; frontend formats as a percentage
