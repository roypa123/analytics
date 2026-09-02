"""Part 8 §8.3. One membership = one billable seat (Part 12 §12.6)."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import WORKSPACE_ROLES
from app.models.base import CoreBase


class Membership(CoreBase):
    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint(
            f"workspace_role IN {WORKSPACE_ROLES}", name="workspace_role_valid"
        ),
        {"schema": "core"},
    )

    workspace_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.accounts.id", ondelete="CASCADE"), primary_key=True
    )
    workspace_role: Mapped[str] = mapped_column(String)
    invited_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("core.accounts.id")
    )
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())
