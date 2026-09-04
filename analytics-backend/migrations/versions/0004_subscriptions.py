"""core.subscriptions — Part 12 (revised: no free tier).

Deliberately smaller than Part 12 §12.3's full documented schema (seat
quantity tracking, GST fields, a `billing_operations` idempotency table) —
this is the minimum needed to gate access on "does this workspace have a
subscription Razorpay considers paid," with one plan and quantity fixed at 1.
Those richer pieces are real, tracked future work, not silently dropped.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.BigInteger(),
            sa.ForeignKey("core.workspaces.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("razorpay_plan_id", sa.String(), nullable=False),
        sa.Column("razorpay_subscription_id", sa.String(), nullable=False, unique=True),
        # Razorpay's subscription.entity.status values: created, authenticated,
        # active, pending, halted, cancelled, completed, paused. Part 12
        # §12.7 — access is granted on "authenticated" or "active", not only
        # "active", so a customer who just completed checkout isn't stuck
        # waiting for the first `subscription.charged` webhook to land.
        sa.Column("status", sa.String(), nullable=False, server_default="created"),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('created','authenticated','active','pending','halted',"
            "'cancelled','completed','paused')",
            name="subscription_status_valid",
        ),
        schema="core",
    )
    op.create_index(
        "ix_subscriptions_razorpay_subscription_id",
        "subscriptions",
        ["razorpay_subscription_id"],
        schema="core",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_subscriptions_razorpay_subscription_id", table_name="subscriptions", schema="core"
    )
    op.drop_table("subscriptions", schema="core")
