"""core.subscriptions — Part 12 (revised again: Orders, not Subscriptions).

Test Mode Subscriptions returns 401 on this account regardless of key
validity (confirmed against Orders/Payments succeeding with the same key),
so billing moves to one Razorpay Order per billing period instead of a
Razorpay-managed recurring mandate. No production data exists yet on this
table, so this replaces it outright rather than an in-place column migration.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(
        "ix_subscriptions_razorpay_subscription_id", table_name="subscriptions", schema="core"
    )
    op.drop_table("subscriptions", schema="core")

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
        sa.Column("razorpay_order_id", sa.String(), nullable=False, unique=True),
        sa.Column("razorpay_payment_id", sa.String(), nullable=True),
        # pending: order created, no captured payment yet. active: a payment
        # captured `current_period_end` in the future. expired: the period
        # lapsed with no fresh payment — checked at request time (deps.py),
        # not pushed by any Razorpay callback, since nothing notifies us that
        # a one-time payment's period has simply run out.
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('pending','active','expired')",
            name="subscription_status_valid",
        ),
        schema="core",
    )
    op.create_index(
        "ix_subscriptions_razorpay_order_id",
        "subscriptions",
        ["razorpay_order_id"],
        schema="core",
    )


def downgrade() -> None:
    op.drop_index("ix_subscriptions_razorpay_order_id", table_name="subscriptions", schema="core")
    op.drop_table("subscriptions", schema="core")

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
