"""Every `core.*` timestamp column is TIMESTAMP WITHOUT TIME ZONE (Part 3
§3.1 — no `type_annotation_map` override), so asyncpg rejects tz-aware
datetimes bound to them. This returns the naive-but-UTC value that convention
requires, instead of each call site reaching for `datetime.now(UTC)` (aware,
fails to bind) or the deprecated `datetime.utcnow()`.
"""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)
