"""core.workspaces.is_organisation — Part 8 §8.1 (D-19), revised.

D-19 originally kept the B2C/B2B distinction entirely out of the schema,
computed instead from live seat count ("a solo account is a workspace with
exactly one member"). In practice that made the very first invite
unreachable: an "Individual" signup and an "Organisation" signup with zero
teammates yet were indistinguishable, so gating Members/Invite/Pending-
invitations on seat count hid the one control needed to grow past one seat
for *both* kinds of workspace.

This column records the signup-time intent instead — the D-25 tab choice —
so the frontend can show the team/permissions UI immediately for an
"Organisation" signup (gated further by role, as already implemented) while
keeping it hidden for "Individual" signups per §8.1's "No teammates, no
invitations, no permission UI." It changes nothing about authorization: every
workspace still uses the same memberships/property_access tables and the same
checks (D-19's "not two data models" holds) — this flag only decides what the
Settings page renders.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column(
            "is_organisation", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        schema="core",
    )


def downgrade() -> None:
    op.drop_column("workspaces", "is_organisation", schema="core")
