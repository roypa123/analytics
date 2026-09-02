"""DeclarativeBase and shared mixins — Part 3 §3.1.

Two schemas: `core` (OLTP, this module's tables) and `analytics` (OLAP,
Part 3 §3.3 onward — modelled separately since most of `analytics.*` is read
via SQLAlchemy Core, not the ORM, per D-14).
"""

from datetime import datetime

from sqlalchemy import MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class CoreBase(Base):
    """Abstract base for every table in the `core` schema."""

    __abstract__ = True
    __table_args__ = {"schema": "core"}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
