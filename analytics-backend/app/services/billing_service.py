"""Part 12 (revised: no free tier) — gates access on a Razorpay subscription
rather than tracking a plan tier for later enforcement.

Deliberately smaller than Part 12's full documented design: one plan, seat
quantity fixed at 1 (D-22's per-seat pricing is real future work), no GST
handling (A-11, needs a qualified accountant before launch), no
`billing_operations` idempotency table (§12.9) — a retried `start_subscription`
call is instead made safe by the workspace/subscription 1:1 UNIQUE constraint
and the "reuse if already in progress" check below, which covers the common
double-click case without the full ledger.
"""

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RazorpaySettings
from app.core.exceptions import NotFoundError
from app.integrations.razorpay_client import RazorpayClient
from app.models.core.subscription import Subscription
from app.repositories.subscription_repo import GRANTS_ACCESS, SubscriptionRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.billing import StartSubscriptionResponse, SubscriptionStatusResponse

# Razorpay subscriptions require a fixed number of billing cycles up front,
# not an open-ended "until cancelled." 100 monthly cycles (~8 years) is a
# pragmatic stand-in for "indefinite" — renewing before this runs out is
# real, currently-unbuilt future work (Part 12 §12.7's lifecycle handling).
_TOTAL_COUNT = 100

# In progress or already granting access — reuse rather than create a second
# Razorpay subscription for the same workspace.
_REUSABLE_STATUSES = (*GRANTS_ACCESS, "created", "pending")


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
        return SubscriptionStatusResponse(status=status, has_access=status in GRANTS_ACCESS)

    async def start_subscription(self, account_id: int) -> StartSubscriptionResponse:
        async with self._session.begin():
            workspace_id = await self._resolve_workspace_id(account_id)
            existing = await self._subscriptions.get_for_workspace(workspace_id)

            if existing is not None and existing.status in _REUSABLE_STATUSES:
                razorpay_subscription_id = existing.razorpay_subscription_id
            else:
                created = await self._client.create_subscription(
                    plan_id=self._settings.plan_id,
                    total_count=_TOTAL_COUNT,
                    notes={"workspace_id": str(workspace_id)},
                )
                razorpay_subscription_id = created["id"]
                if existing is None:
                    await self._subscriptions.create(
                        workspace_id=workspace_id,
                        razorpay_plan_id=self._settings.plan_id,
                        razorpay_subscription_id=razorpay_subscription_id,
                    )
                else:
                    # A previously cancelled/completed/halted subscription —
                    # the UNIQUE(workspace_id) constraint means this row is
                    # replaced in place rather than a second one inserted.
                    existing.razorpay_plan_id = self._settings.plan_id
                    existing.razorpay_subscription_id = razorpay_subscription_id
                    existing.status = created.get("status", "created")
                    await self._session.flush()

            return StartSubscriptionResponse(
                razorpay_key_id=self._settings.key_id,
                razorpay_subscription_id=razorpay_subscription_id,
                plan_name=self._settings.plan_name,
                amount_paise=self._settings.plan_amount_paise,
                currency="INR",
            )

    def verify_checkout_signature(
        self, *, razorpay_payment_id: str, razorpay_subscription_id: str, signature: str
    ) -> bool:
        return self._client.verify_checkout_signature(
            razorpay_payment_id=razorpay_payment_id,
            razorpay_subscription_id=razorpay_subscription_id,
            signature=signature,
        )

    async def confirm_checkout(
        self, account_id: int, *, razorpay_payment_id: str, razorpay_subscription_id: str
    ) -> SubscriptionStatusResponse:
        """Optimistic path (Part 12 §12.7): the browser just completed
        Checkout, so fetch the subscription straight from Razorpay and
        reflect it immediately rather than making the user wait for the
        webhook. The webhook (`handle_webhook` below) remains authoritative
        for every status change after this point, including ones this
        endpoint never sees."""
        workspace_id = await self._resolve_workspace_id(account_id)
        subscription = await self._subscriptions.get_for_workspace(workspace_id)
        if subscription is None or subscription.razorpay_subscription_id != (
            razorpay_subscription_id
        ):
            raise NotFoundError("Subscription not found.", code="subscription_not_found")

        remote = await self._client.fetch_subscription(razorpay_subscription_id)
        async with self._session.begin():
            await self._apply_remote_status(subscription, remote)
        return await self.get_status(account_id)

    async def handle_webhook(self, *, raw_body: bytes, signature: str) -> None:
        if not self._client.verify_webhook_signature(raw_body=raw_body, signature=signature):
            # Part 2 §2.5-style posture applied to webhooks: an unverifiable
            # request is silently ignored, not surfaced as an error a replay
            # could use to probe for the right signature.
            return

        payload = json.loads(raw_body)
        entity = payload.get("payload", {}).get("subscription", {}).get("entity")
        if not isinstance(entity, dict) or "id" not in entity:
            return

        async with self._session.begin():
            subscription = await self._subscriptions.get_by_razorpay_id(entity["id"])
            if subscription is None:
                return
            await self._apply_remote_status(subscription, entity)

    async def _apply_remote_status(
        self, subscription: Subscription, remote: dict[str, Any]
    ) -> None:
        subscription.status = remote.get("status", subscription.status)
        current_end = remote.get("current_end")
        if isinstance(current_end, int):
            subscription.current_period_end = datetime.fromtimestamp(current_end, tz=UTC)
        await self._session.flush()
