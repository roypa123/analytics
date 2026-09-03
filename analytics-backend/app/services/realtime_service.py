"""Part 2 §2.7 — shapes the Redis-backed active-visitor snapshot into the
API's wire schema. Deliberately thin: all the actual state lives in Redis
(`RealtimeRepository`); this just picks top-N and converts `Counter`s."""

import time

from app.repositories.realtime_repo import RealtimeRepository
from app.schemas.realtime import ActiveCountry, ActivePage, RealtimeSnapshot

_TOP_PAGES_LIMIT = 20
_TOP_COUNTRIES_LIMIT = 50


class RealtimeService:
    def __init__(self, repo: RealtimeRepository) -> None:
        self._repo = repo

    async def get_snapshot(self, *, property_id: int, window_seconds: int) -> RealtimeSnapshot:
        data = await self._repo.get_active_snapshot(
            property_id=property_id, now_epoch=time.time(), window_seconds=window_seconds
        )
        return RealtimeSnapshot(
            active_visitors=data.active_visitor_count,
            active_countries=[
                ActiveCountry(country_code=code, count=count)
                for code, count in data.countries.most_common(_TOP_COUNTRIES_LIMIT)
            ],
            active_pages=[
                ActivePage(path=path, active_visitors=count)
                for path, count in data.pages.most_common(_TOP_PAGES_LIMIT)
            ],
        )
