"""Part 1 §1.5 — the collector's input model. A minimal envelope for the
Tier-1 event shape; enrichment fields (device, geo, channel_group) are
server-derived and never accepted from the client."""

from pydantic import Field

from app.schemas.common import CamelModel


class CollectorEventRequest(CamelModel):
    event_id: str = Field(description="Client-generated UUID v7 — Part 1 §1.9 dedup key")
    tracking_id: str
    occurred_at: str
    event_name: str = "pageview"
    page_url: str
    referrer_url: str | None = None
    screen_width: int | None = None
    viewport_width: int | None = None
    properties: dict[str, str | int | float | bool] | None = None
