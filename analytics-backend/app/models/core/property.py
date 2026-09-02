"""Part 3 §3.2. One tracked website / data stream."""

from datetime import datetime

from sqlalchemy import ARRAY, BigInteger, Boolean, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase


class Property(CoreBase):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String)
    tracking_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    domain: Mapped[str] = mapped_column(String)
    timezone: Mapped[str] = mapped_column(String, default="UTC")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    excluded_ips: Mapped[list[str]] = mapped_column(ARRAY(INET), default=list)
    excluded_paths: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    bot_filtering: Mapped[bool] = mapped_column(Boolean, default=True)
    retention_days: Mapped[int] = mapped_column(Integer, default=90)
    cache_epoch: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    deleted_at: Mapped[datetime | None]
