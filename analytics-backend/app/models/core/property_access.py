"""Part 8 §8.2, §8.3. The per-property grant — the mechanism behind
"some persons can see some parts": a member with no row here for a property
does not see it at all (Part 8 §8.6, composition rule 3)."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.types import PROPERTY_ROLES
from app.models.base import CoreBase


class PropertyAccess(CoreBase):
    __tablename__ = "property_access"
    __table_args__ = (
        CheckConstraint(
            f"property_role IN {PROPERTY_ROLES}", name="property_role_valid"
        ),
        {"schema": "core"},
    )

    property_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.properties.id", ondelete="CASCADE"), primary_key=True
    )
    account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("core.accounts.id", ondelete="CASCADE"), primary_key=True
    )
    property_role: Mapped[str] = mapped_column(String)
    granted_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("core.accounts.id")
    )
    granted_at: Mapped[datetime] = mapped_column(server_default=func.now())
