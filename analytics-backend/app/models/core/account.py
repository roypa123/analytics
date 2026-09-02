"""Part 3 §3.2, Part 8 §8.4."""

from datetime import datetime

from sqlalchemy import LargeBinary, String
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase, TimestampMixin


class Account(CoreBase, TimestampMixin):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(CITEXT, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String)
    full_name: Mapped[str] = mapped_column(String)
    email_verified_at: Mapped[datetime | None]
    mfa_secret: Mapped[bytes | None] = mapped_column(LargeBinary)
    status: Mapped[str] = mapped_column(String, default="active")
