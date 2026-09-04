"""Part 4 §4.1, D-11 — the router IS the controller.

`webhook` deliberately takes no `get_current_account` dependency: Razorpay
calls it directly, authenticated only by the HMAC signature on the raw body,
the same posture the collector takes toward its own public, unauthenticated
surface (Part 2 §2.3).
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_current_account, get_write_session
from app.core.config import Settings
from app.models.core.account import Account
from app.schemas.billing import (
    ConfirmCheckoutRequest,
    StartCheckoutResponse,
    SubscriptionStatusResponse,
)
from app.schemas.common import Envelope
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["billing"])


def _service(session: AsyncSession, settings: Settings) -> BillingService:
    return BillingService(session, settings=settings.razorpay)


@router.get("/status", response_model=Envelope[SubscriptionStatusResponse])
async def get_status(
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[SubscriptionStatusResponse]:
    status = await _service(session, settings).get_status(account.id)
    return Envelope(data=status)


@router.post("/subscribe", response_model=Envelope[StartCheckoutResponse])
async def start_checkout(
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[StartCheckoutResponse]:
    result = await _service(session, settings).start_checkout(account.id)
    return Envelope(data=result)


@router.post("/confirm", response_model=Envelope[SubscriptionStatusResponse])
async def confirm_checkout(
    body: ConfirmCheckoutRequest,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[SubscriptionStatusResponse]:
    service = _service(session, settings)
    if not service.verify_checkout_signature(
        razorpay_order_id=body.razorpay_order_id,
        razorpay_payment_id=body.razorpay_payment_id,
        signature=body.razorpay_signature,
    ):
        # Doesn't touch the DB either way — an unverified signature just
        # means "the webhook will have to be what confirms this," not an
        # error the browser needs to react to.
        return Envelope(data=await service.get_status(account.id))

    status = await service.confirm_checkout(
        account.id,
        razorpay_order_id=body.razorpay_order_id,
        razorpay_payment_id=body.razorpay_payment_id,
    )
    return Envelope(data=status)


@router.post("/webhook", status_code=200)
async def webhook(
    request: Request,
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> dict[str, bool]:
    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    await _service(session, settings).handle_webhook(raw_body=raw_body, signature=signature)
    return {"ok": True}
