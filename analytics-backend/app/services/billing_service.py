"""Part 12 (revised again: Orders, not Subscriptions) — gates access on a
captured Razorpay payment rather than a Razorpay-managed recurring mandate.

This account's Test Mode Subscriptions product returns 401 on every call
regardless of key validity — confirmed by the same key succeeding against
Orders/Payments, and by the dashboard itself refusing to create a Plan in
Test Mode while succeeding in Live Mode. Since Live Mode means real charges
and isn't appropriate for building/testing this integration, billing is
built on one Razorpay Order per billing period instead: a captured payment
grants `RazorpaySettings.billing_period_days` of access, and the customer
returns for a fresh checkout once that period lapses rather than Razorpay
silently re-charging a saved mandate.
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RazorpaySettings
from app.core.exceptions import NotFoundError, UpstreamError
from app.integrations.razorpay_client import RazorpayClient
from app.models.core.subscription import Subscription
from app.repositories.subscription_repo import SubscriptionRepository, grants_access
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.billing import StartCheckoutResponse, SubscriptionStatusResponse

logger = structlog.get_logger(__name__)


class BillingService:
    def __init__(self, session: AsyncSession, *, settings: RazorpaySettings) -> None:
        self._session = session
        self._settings = settings
        self._subscriptions = SubscriptionRepository(session)
        self._workspaces = WorkspaceRepository(session)
        self._client = RazorpayClient(settings)

    async def _resolve_workspace_id(self, account_id: int) -> int:
        """Same resolution `PropertyService`/`require_active_subscription`
        use — whichever workspace an organisation-preferring order picks
        first (app/repositories/workspace_repo.py's `list_for_account`)."""
        workspaces = await self._workspaces.list_for_account(account_id)
        if not workspaces:
            raise NotFoundError(
                "No workspace found for this account.", code="workspace_not_found"
            )
        return workspaces[0].id

    async def get_status(self, account_id: int) -> SubscriptionStatusResponse:
        workspace_id = await self._resolve_workspace_id(account_id)
        subscription = await self._subscriptions.get_for_workspace(workspace_id)
        status = subscription.status if subscription is not None else None
        return SubscriptionStatusResponse(
            status=status, has_access=grants_access(subscription)
        )

    async def start_checkout(self, account_id: int) -> StartCheckoutResponse:
        async with self._session.begin():
            workspace_id = await self._resolve_workspace_id(account_id)
            existing = await self._subscriptions.get_for_workspace(workspace_id)

            try:
                created = await self._client.create_order(
                    amount_paise=self._settings.plan_amount_paise,
                    currency="INR",
                    receipt=f"workspace-{workspace_id}-{int(datetime.now(UTC).timestamp())}",
                    notes={"workspace_id": str(workspace_id)},
                )
            except (httpx.HTTPStatusError, httpx.TransportError) as exc:
                logger.error("razorpay_create_order_failed", error=str(exc))
                raise UpstreamError(
                    "Could not start checkout with the payment provider.",
                    code="razorpay_error",
                ) from exc
            razorpay_order_id = created["id"]

            if existing is None:
                await self._subscriptions.create(
                    workspace_id=workspace_id, razorpay_order_id=razorpay_order_id
                )
            else:
                # UNIQUE(workspace_id) means this row is replaced in place —
                # each checkout attempt (first payment or renewal) gets its
                # own fresh Order rather than reusing a stale one.
                existing.razorpay_order_id = razorpay_order_id
                existing.status = "pending"
                await self._session.flush()

            return StartCheckoutResponse(
                razorpay_key_id=self._settings.key_id,
                razorpay_order_id=razorpay_order_id,
                plan_name=self._settings.plan_name,
                amount_paise=self._settings.plan_amount_paise,
                currency="INR",
            )

    def verify_checkout_signature(
        self, *, razorpay_order_id: str, razorpay_payment_id: str, signature: str
    ) -> bool:
        return self._client.verify_checkout_signature(
            razorpay_order_id=razorpay_order_id,
            razorpay_payment_id=razorpay_payment_id,
            signature=signature,
        )

    async def confirm_checkout(
        self, account_id: int, *, razorpay_order_id: str, razorpay_payment_id: str
    ) -> SubscriptionStatusResponse:
        """Optimistic path: the browser just completed Checkout, so fetch the
        payment straight from Razorpay and reflect it immediately rather than
        making the user wait for the webhook. The webhook (`handle_webhook`
        below) remains authoritative for every confirmation this endpoint
        never sees (tab closed mid-flow, etc.)."""
        workspace_id = await self._resolve_workspace_id(account_id)
        subscription = await self._subscriptions.get_for_workspace(workspace_id)
        if subscription is None or subscription.razorpay_order_id != razorpay_order_id:
            raise NotFoundError("Order not found.", code="order_not_found")

        try:
            payment = await self._client.fetch_payment(razorpay_payment_id)
        except (httpx.HTTPStatusError, httpx.TransportError) as exc:
            logger.error("razorpay_fetch_payment_failed", error=str(exc))
            raise UpstreamError(
                "Could not confirm payment with the payment provider.",
                code="razorpay_error",
            ) from exc

        async with self._session.begin():
            await self._apply_captured_payment(subscription, payment)
        return await self.get_status(account_id)

    async def handle_webhook(self, *, raw_body: bytes, signature: str) -> None:
        if not self._client.verify_webhook_signature(raw_body=raw_body, signature=signature):
            # An unverifiable request is silently ignored, not surfaced as an
            # error a replay could use to probe for the right signature.
            return

        payload = json.loads(raw_body)
        if payload.get("event") != "payment.captured":
            return
        entity = payload.get("payload", {}).get("payment", {}).get("entity")
        if not isinstance(entity, dict) or "order_id" not in entity:
            return

        async with self._session.begin():
            subscription = await self._subscriptions.get_by_order_id(entity["order_id"])
            if subscription is None:
                return
            await self._apply_captured_payment(subscription, entity)

    async def _apply_captured_payment(
        self, subscription: Subscription, payment: dict[str, Any]
    ) -> None:
        if payment.get("status") != "captured":
            return
        payment_id = payment.get("id")
        if not isinstance(payment_id, str):
            return
        if subscription.razorpay_payment_id == payment_id:
            # Already applied — the confirm-checkout call and the webhook
            # both reaching here for the same payment is expected, not an
            # error; re-applying would extend the period a second time.
            return
        period_end = datetime.now(UTC) + timedelta(days=self._settings.billing_period_days)
        await self._subscriptions.mark_paid(
            subscription, razorpay_payment_id=payment_id, period_end=period_end
        )
