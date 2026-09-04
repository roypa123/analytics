"""Part 12 (revised again: Orders, not Subscriptions) — `core.subscriptions`."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core.subscription import Subscription


def grants_access(subscription: Subscription | None) -> bool:
    """A captured payment only grants access for `billing_period_days` from
    when it was confirmed — unlike Razorpay Subscriptions, nothing calls us
    back when that period lapses, so this is re-evaluated at request time
    rather than trusted from `status` alone."""
    if subscription is None or subscription.status != "active":
        return False
    if subscription.current_period_end is None:
        return False
    return subscription.current_period_end > datetime.now(UTC)


class SubscriptionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_for_workspace(self, workspace_id: int) -> Subscription | None:
        stmt = select(Subscription).where(Subscription.workspace_id == workspace_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_order_id(self, razorpay_order_id: str) -> Subscription | None:
        stmt = select(Subscription).where(Subscription.razorpay_order_id == razorpay_order_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, *, workspace_id: int, razorpay_order_id: str) -> Subscription:
        subscription = Subscription(
            workspace_id=workspace_id,
            razorpay_order_id=razorpay_order_id,
            status="pending",
        )
        self._session.add(subscription)
        await self._session.flush()
        return subscription

    async def mark_paid(
        self, subscription: Subscription, *, razorpay_payment_id: str, period_end: datetime
    ) -> None:
        subscription.razorpay_payment_id = razorpay_payment_id
        subscription.status = "active"
        subscription.current_period_end = period_end
        await self._session.flush()
