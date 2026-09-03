"""Part 2 §2.7 — the realtime snapshot's wire contract. Field names match the
frontend's already-built `ActiveCountry` (realtime-map.tsx) and `ActivePage`
(realtime-page-list.tsx) props exactly, so wiring the TanStack Query hook up
to this endpoint is a direct pass-through with no reshaping."""

from app.schemas.common import CamelModel


class ActiveCountry(CamelModel):
    country_code: str
    count: int


class ActivePage(CamelModel):
    path: str
    active_visitors: int


class RealtimeSnapshot(CamelModel):
    active_visitors: int
    active_countries: list[ActiveCountry]
    active_pages: list[ActivePage]
