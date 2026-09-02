"""core schema — accounts, workspaces, memberships, properties,
property_access, invitations, refresh_tokens

Part 3 §3.2, Part 8 §8.3.

Revision ID: 0001
Revises:
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS core")
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")  # gen_random_uuid()

    op.create_table(
        "accounts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("mfa_secret", sa.LargeBinary(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_accounts_email"),
        schema="core",
    )

    op.create_table(
        "workspaces",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", postgresql.CITEXT(), nullable=False),
        sa.Column("plan", sa.String(), nullable=False, server_default="free"),
        sa.Column("event_quota_monthly", sa.BigInteger(), nullable=False, server_default="100000"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("slug", name="uq_workspaces_slug"),
        schema="core",
    )

    op.create_table(
        "memberships",
        sa.Column(
            "workspace_id", sa.BigInteger(),
            sa.ForeignKey("core.workspaces.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column(
            "account_id", sa.BigInteger(),
            sa.ForeignKey("core.accounts.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column("workspace_role", sa.String(), nullable=False),
        sa.Column("invited_by", sa.BigInteger(), sa.ForeignKey("core.accounts.id"), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "workspace_role IN ('owner','admin','member')", name="workspace_role_valid"
        ),
        schema="core",
    )
    op.create_index("ix_memberships_account_id", "memberships", ["account_id"], schema="core")

    op.create_table(
        "properties",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "workspace_id", sa.BigInteger(),
            sa.ForeignKey("core.workspaces.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("tracking_id", sa.String(), nullable=False),
        sa.Column("domain", sa.String(), nullable=False),
        sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column(
            "excluded_ips", postgresql.ARRAY(postgresql.INET()),
            nullable=False, server_default="{}",
        ),
        sa.Column(
            "excluded_paths", postgresql.ARRAY(sa.String()),
            nullable=False, server_default="{}",
        ),
        sa.Column("bot_filtering", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("cache_epoch", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tracking_id", name="uq_properties_tracking_id"),
        schema="core",
    )
    op.create_index(
        "ix_properties_workspace_id", "properties", ["workspace_id"],
        schema="core", postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "property_access",
        sa.Column(
            "property_id", sa.BigInteger(),
            sa.ForeignKey("core.properties.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column(
            "account_id", sa.BigInteger(),
            sa.ForeignKey("core.accounts.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column("property_role", sa.String(), nullable=False),
        sa.Column("granted_by", sa.BigInteger(), sa.ForeignKey("core.accounts.id"), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "property_role IN ('admin','analyst','viewer')", name="property_role_valid"
        ),
        schema="core",
    )
    op.create_index(
        "ix_property_access_account_id", "property_access", ["account_id"], schema="core"
    )

    op.create_table(
        "invitations",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "workspace_id", sa.BigInteger(),
            sa.ForeignKey("core.workspaces.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("workspace_role", sa.String(), nullable=False),
        sa.Column("property_grants", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("invited_by", sa.BigInteger(), sa.ForeignKey("core.accounts.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="core",
    )
    op.create_index(
        "uq_invitations_workspace_email_pending", "invitations", ["workspace_id", "email"],
        unique=True, schema="core", postgresql_where=sa.text("accepted_at IS NULL"),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "account_id", sa.BigInteger(),
            sa.ForeignKey("core.accounts.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("ip_hash", sa.LargeBinary(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        schema="core",
    )
    op.create_index(
        "ix_refresh_tokens_account_id", "refresh_tokens", ["account_id"],
        schema="core", postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("refresh_tokens", schema="core")
    op.drop_table("invitations", schema="core")
    op.drop_table("property_access", schema="core")
    op.drop_table("properties", schema="core")
    op.drop_table("memberships", schema="core")
    op.drop_table("workspaces", schema="core")
    op.drop_table("accounts", schema="core")
