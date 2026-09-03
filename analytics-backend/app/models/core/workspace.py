"""Part 3 §3.2. The tenancy + billing boundary (Part 8 §8.2)."""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, String, func
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase


class Workspace(CoreBase):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(CITEXT, unique=True, index=True)
    plan: Mapped[str] = mapped_column(String, default="free")
    # Part 8 §8.1 (D-19, revised) — the D-25 signup-tab choice, kept only to
    # decide which Settings sections render (Members/Invite/Pending
    # invitations). Authorization itself never branches on this column.
    is_organisation: Mapped[bool] = mapped_column(Boolean, default=False)
    event_quota_monthly: Mapped[int] = mapped_column(BigInteger, default=100_000)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    deleted_at: Mapped[datetime | None]
