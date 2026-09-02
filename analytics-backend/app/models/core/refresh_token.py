"""Part 8 §8.4. Opaque, server-side, rotated on every use. A reused token
signals replay and revokes the whole `family_id` (D-20)."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase


class RefreshToken(CoreBase):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.accounts.id", ondelete="CASCADE"), index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    user_agent: Mapped[str | None] = mapped_column(String)
    ip_hash: Mapped[bytes | None] = mapped_column(LargeBinary)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    used_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
