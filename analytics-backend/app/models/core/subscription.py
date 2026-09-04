"""Part 12 (revised again: Orders, not Subscriptions) — one billing row per
workspace, tracking the latest Razorpay Order/Payment and how long it paid
access for."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase

_STATUS_VALUES = ("pending", "active", "expired")


class Subscription(CoreBase):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(
            f"status IN {_STATUS_VALUES}", name="subscription_status_valid"
        ),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.workspaces.id", ondelete="CASCADE"), unique=True
    )
    razorpay_order_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")
    current_period_end: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
