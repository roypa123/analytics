"""Part 3 §3.2. The tenancy + billing boundary (Part 8 §8.2)."""

from datetime import datetime

from sqlalchemy import BigInteger, String, func
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase


class Workspace(CoreBase):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(CITEXT, unique=True, index=True)
    plan: Mapped[str] = mapped_column(String, default="free")
    event_quota_monthly: Mapped[int] = mapped_column(BigInteger, default=100_000)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    deleted_at: Mapped[datetime | None]
