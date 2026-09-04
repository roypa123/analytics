"""Part 4 §4.1, D-11 — the router IS the controller."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_account, get_write_session
from app.models.core.account import Account
from app.schemas.common import Envelope
from app.schemas.property import CreatePropertyRequest, PropertySummary
from app.services.property_service import PropertyService, PropertyWithRole

router = APIRouter(prefix="/properties", tags=["properties"])


def _summary(entry: PropertyWithRole) -> PropertySummary:
    return PropertySummary(
        id=entry.property.id,
        name=entry.property.name,
        domain=entry.property.domain,
        tracking_id=entry.property.tracking_id,
        timezone=entry.property.timezone,
        my_role=entry.my_role,
    )


@router.post("", response_model=Envelope[PropertySummary], status_code=201)
async def create_property(
    body: CreatePropertyRequest,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
) -> Envelope[PropertySummary]:
    service = PropertyService(session)
    entry = await service.create_for_account(
        account_id=account.id, name=body.name, domain=body.domain
    )
    return Envelope(data=_summary(entry))


@router.get("", response_model=Envelope[list[PropertySummary]])
async def list_properties(
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
) -> Envelope[list[PropertySummary]]:
    service = PropertyService(session)
    entries = await service.list_for_account(account.id)
    return Envelope(data=[_summary(e) for e in entries])


@router.delete("/{property_id}", status_code=204)
async def delete_property(
    property_id: int,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
) -> None:
    service = PropertyService(session)
    await service.delete_property(account_id=account.id, property_id=property_id)
