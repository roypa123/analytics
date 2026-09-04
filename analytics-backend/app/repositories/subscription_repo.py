"""Part 12 (revised) — `core.subscriptions`."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core.subscription import Subscription

# Part 12 §12.7 — a customer who just finished Razorpay Checkout has an
# "authenticated" mandate but hasn't necessarily had the first charge settle
# yet; granting access only on "active" makes a successful payment look like
# nothing happened until the webhook catches up.
GRANTS_ACCESS = ("authenticated", "active")


class SubscriptionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_for_workspace(self, workspace_id: int) -> Subscription | None:
        stmt = select(Subscription).where(Subscription.workspace_id == workspace_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_razorpay_id(self, razorpay_subscription_id: str) -> Subscription | None:
        stmt = select(Subscription).where(
            Subscription.razorpay_subscription_id == razorpay_subscription_id
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self, *, workspace_id: int, razorpay_plan_id: str, razorpay_subscription_id: str
    ) -> Subscription:
        subscription = Subscription(
            workspace_id=workspace_id,
            razorpay_plan_id=razorpay_plan_id,
            razorpay_subscription_id=razorpay_subscription_id,
            status="created",
        )
        self._session.add(subscription)
        await self._session.flush()
        return subscription

    async def update_status(self, subscription: Subscription, *, status: str) -> None:
        subscription.status = status
        await self._session.flush()
