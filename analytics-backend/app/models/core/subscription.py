"""Part 12 (revised: no free tier) — one Razorpay subscription per workspace,
gating access rather than merely tracking a plan tier."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase

_STATUS_VALUES = (
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "cancelled",
    "completed",
    "paused",
)


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
    razorpay_plan_id: Mapped[str] = mapped_column(String)
    razorpay_subscription_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    status: Mapped[str] = mapped_column(String, default="created")
    current_period_end: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
