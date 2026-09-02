"""Part 4 §4.1, D-11 — the router IS the controller."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_account, get_write_session
from app.models.core.account import Account
from app.models.core.property import Property
from app.schemas.common import Envelope
from app.schemas.property import CreatePropertyRequest, PropertySummary
from app.services.property_service import PropertyService

router = APIRouter(prefix="/properties", tags=["properties"])


def _summary(property_: Property) -> PropertySummary:
    return PropertySummary(
        id=property_.id,
        name=property_.name,
        domain=property_.domain,
        tracking_id=property_.tracking_id,
        timezone=property_.timezone,
    )


@router.post("", response_model=Envelope[PropertySummary], status_code=201)
async def create_property(
    body: CreatePropertyRequest,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
) -> Envelope[PropertySummary]:
    service = PropertyService(session)
    property_ = await service.create_for_account(
        account_id=account.id, name=body.name, domain=body.domain
    )
    return Envelope(data=_summary(property_))


@router.get("", response_model=Envelope[list[PropertySummary]])
async def list_properties(
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
) -> Envelope[list[PropertySummary]]:
    service = PropertyService(session)
    properties = await service.list_for_account(account.id)
    return Envelope(data=[_summary(p) for p in properties])
