"""DeclarativeBase and shared mixins — Part 3 §3.1.

Two schemas: `core` (OLTP, this module's tables) and `analytics` (OLAP,
Part 3 §3.3 onward — modelled separately since most of `analytics.*` is read
via SQLAlchemy Core, not the ORM, per D-14).
"""

from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
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
    # Every `core.*` timestamp column is genuinely TIMESTAMP WITH TIME ZONE
    # in the live schema (migrations/versions/0001_core_schema.py declares
    # every one of them `sa.DateTime(timezone=True)`), but a bare
    # `Mapped[datetime]` gives SQLAlchemy no way to know that — it falls back
    # to a non-tz `DateTime`, which drives how it casts bind parameters in
    # generated SQL (`$1::TIMESTAMP WITHOUT TIME ZONE`) independently of what
    # the column actually is. That mismatch is latent right up until an aware
    # datetime is bound (asyncpg's codec for that cast rejects it) or an
    # aware value read back from the real timestamptz column is compared
    # against a naive one in Python (`utils/time.py::utcnow()`) — both
    # observed live while building workspace invitations. This map is the
    # one-line fix: every `Mapped[datetime]` in `core.*` now matches the
    # real column type without touching each model.
    type_annotation_map = {datetime: DateTime(timezone=True)}


class CoreBase(Base):
    """Abstract base for every table in the `core` schema."""

    __abstract__ = True
    __table_args__ = {"schema": "core"}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
