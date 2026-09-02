"""Part 8 §8.3, §8.8. A pending membership for an email that may not yet
have an account; `property_grants` is materialized into `PropertyAccess`
rows on acceptance."""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CoreBase


class Invitation(CoreBase):
    __tablename__ = "invitations"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.workspaces.id", ondelete="CASCADE")
    )
    email: Mapped[str] = mapped_column(CITEXT)
    workspace_role: Mapped[str] = mapped_column(String)
    property_grants: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    # sha256 of the raw token — never store the bearer credential itself.
    token_hash: Mapped[bytes] = mapped_column(LargeBinary)
    invited_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("core.accounts.id"))
    expires_at: Mapped[datetime]
    accepted_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
