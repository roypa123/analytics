"""Part 2 §2.7, D-11 — the router is the controller. Reads only touch Redis
(via `RealtimeRepository`), never Postgres, per the documented realtime path."""

from fastapi import APIRouter, Depends

from app.api.deps import get_app_settings, get_owned_property, get_realtime_repo
from app.core.config import Settings
from app.models.core.property import Property
from app.repositories.realtime_repo import RealtimeRepository
from app.schemas.common import Envelope
from app.schemas.realtime import RealtimeSnapshot
from app.services.realtime_service import RealtimeService

router = APIRouter(prefix="/properties/{property_id}", tags=["realtime"])


@router.get("/realtime", response_model=Envelope[RealtimeSnapshot])
async def get_realtime_snapshot(
    property_: Property = Depends(get_owned_property),
    repo: RealtimeRepository = Depends(get_realtime_repo),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[RealtimeSnapshot]:
    service = RealtimeService(repo)
    window_seconds = settings.ingestion.session_timeout_minutes * 60
    snapshot = await service.get_snapshot(property_id=property_.id, window_seconds=window_seconds)
    return Envelope(data=snapshot)
