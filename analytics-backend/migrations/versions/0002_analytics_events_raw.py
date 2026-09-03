"""analytics.events_raw — Part 3 §3.3, §3.4, §3.5.

Phase 1 (docs/architecture/05-ingestion-pipeline.md): device_type,
browser_name, os_name, and channel_group are plain `text` here rather than
the documented `smallint` dictionary columns (Part 3 §3.3 "On dictionary
encoding") — there are no `dim_*` lookup tables yet, and at Phase 1 write
volume the row-size saving doesn't yet pay for the lookup-or-create machinery
that dictionary encoding needs on the write path. Converting these four
columns to smallint + `dim_*` tables is a documented, backwards-compatible
follow-up (a backfill, not a redesign) once volume justifies it.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-03
"""

from collections.abc import Sequence
from datetime import date, timedelta

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Part 3 §3.4, D-09: partitions must exist before data arrives. There is no
# pg_partman and no worker job yet in Phase 1 (see
# scripts/ensure_partitions.py, meant to be run from cron as the interim
# mechanism), so this migration pre-creates a generous window. That window
# WILL run out — ops must run the script (or extend it) before day
# `_DAYS_AHEAD` from whenever this migration ran.
_DAYS_BEHIND = 3
_DAYS_AHEAD = 34


def _partition_name(day: date) -> str:
    return f"events_raw_{day.strftime('%Y%m%d')}"


def upgrade() -> None:
    op.create_table(
        "events_raw",
        # 8-byte columns first (Action A-06 — column order here is
        # alignment-driven; do not "tidy" it into declaration order).
        sa.Column("property_id", sa.BigInteger(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        # Fixed-width 16-byte identifiers.
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("visitor_hash", postgresql.BYTEA(), nullable=False),
        # 4-byte columns.
        sa.Column("screen_width", sa.Integer(), nullable=True),
        sa.Column("viewport_width", sa.Integer(), nullable=True),
        sa.Column("city_geoname_id", sa.Integer(), nullable=True),
        # 1-byte columns.
        sa.Column("is_bot", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("clock_skew", sa.Boolean(), nullable=False, server_default=sa.false()),
        # Variable-length.
        sa.Column("event_name", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("page_path", sa.String(), nullable=True),
        sa.Column("page_query", sa.String(), nullable=True),
        sa.Column("page_hostname", sa.String(), nullable=True),
        sa.Column("page_title", sa.String(), nullable=True),
        sa.Column("referrer_domain", sa.String(), nullable=True),
        sa.Column("referrer_path", sa.String(), nullable=True),
        sa.Column("utm_source", sa.String(), nullable=True),
        sa.Column("utm_medium", sa.String(), nullable=True),
        sa.Column("utm_campaign", sa.String(), nullable=True),
        sa.Column("utm_term", sa.String(), nullable=True),
        sa.Column("utm_content", sa.String(), nullable=True),
        # Phase 1: text, not smallint — see module docstring.
        sa.Column("channel_group", sa.String(), nullable=True),
        sa.Column("device_type", sa.String(), nullable=True),
        sa.Column("browser_name", sa.String(), nullable=True),
        sa.Column("browser_version", sa.String(), nullable=True),
        sa.Column("os_name", sa.String(), nullable=True),
        sa.Column("os_version", sa.String(), nullable=True),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("region_code", sa.String(), nullable=True),
        sa.Column("properties", postgresql.JSONB(), nullable=True),
        sa.PrimaryKeyConstraint(
            "property_id", "received_at", "event_id", name="pk_events_raw"
        ),
        schema="analytics",
        postgresql_partition_by="RANGE (received_at)",
    )

    # Part 3 §3.5 — write-rate-conscious indexing. BRIN on occurred_at
    # (reports filter on occurred_at; physical order correlates with it
    # because the table is partitioned/inserted by received_at ≈ occurred_at).
    op.execute(
        "CREATE INDEX events_raw_occurred_brin ON analytics.events_raw "
        "USING BRIN (occurred_at) WITH (pages_per_range = 32)"
    )
    # Sessionizer's access pattern (unsessionized backlog only). Phase 1
    # assigns session_id synchronously at ingest, so this index stays tiny —
    # it exists for schema fidelity and for the eventual batch sessionizer's
    # drift-correction pass (Part 3 §3.5).
    op.execute(
        "CREATE INDEX events_raw_sessionize ON analytics.events_raw "
        "(property_id, visitor_hash, occurred_at) WHERE session_id IS NULL"
    )
    op.execute(
        "CREATE INDEX events_raw_named ON analytics.events_raw "
        "(property_id, event_name, occurred_at) WHERE event_name <> 'pageview'"
    )

    # Part 3 §3.4 — always a DEFAULT partition, alert if it is ever non-empty.
    op.execute(
        "CREATE TABLE analytics.events_raw_default "
        "PARTITION OF analytics.events_raw DEFAULT"
    )

    today = date.today()
    start = today - timedelta(days=_DAYS_BEHIND)
    for offset in range(_DAYS_BEHIND + _DAYS_AHEAD + 1):
        day = start + timedelta(days=offset)
        next_day = day + timedelta(days=1)
        op.execute(
            f"CREATE TABLE analytics.{_partition_name(day)} "
            f"PARTITION OF analytics.events_raw "
            f"FOR VALUES FROM ('{day.isoformat()}') TO ('{next_day.isoformat()}')"
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analytics.events_raw CASCADE")
