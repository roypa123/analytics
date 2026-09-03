"""Part 1 §1.11-§1.12, D-11 — Tier-1 breakdown reports and the dashboard
summary. Both are read-only, range-capped queries over `events_raw`
(`app/services/reports_service.py` for why there's no rollup table yet)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_owned_property, get_read_session
from app.core.config import Settings
from app.core.types import ReportDimension
from app.models.core.property import Property
from app.repositories.reports_repo import ReportsRepository
from app.schemas.common import Envelope
from app.schemas.dashboard import DashboardSummary
from app.schemas.reports import ReportRow
from app.services.reports_service import ReportsService

router = APIRouter(prefix="/properties/{property_id}", tags=["reports"])


def _service(session: AsyncSession, settings: Settings) -> ReportsService:
    return ReportsService(ReportsRepository(session), settings)


@router.get("/reports/{dimension}", response_model=Envelope[list[ReportRow]])
async def get_report_breakdown(
    dimension: ReportDimension,
    property_: Property = Depends(get_owned_property),
    session: AsyncSession = Depends(get_read_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[list[ReportRow]]:
    rows = await _service(session, settings).get_breakdown(property_=property_, dimension=dimension)
    return Envelope(data=rows)


@router.get("/dashboard/summary", response_model=Envelope[DashboardSummary])
async def get_dashboard_summary(
    property_: Property = Depends(get_owned_property),
    session: AsyncSession = Depends(get_read_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[DashboardSummary]:
    summary = await _service(session, settings).get_dashboard_summary(property_=property_)
    return Envelope(data=summary)
