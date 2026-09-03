"""Every `core.*` timestamp column is TIMESTAMP WITH TIME ZONE
(migrations/versions/0001_core_schema.py — every column there is declared
`sa.DateTime(timezone=True)`, despite `app/models/base.py`'s bare
`Mapped[datetime]` giving no hint of that from the model alone). asyncpg
always returns an aware datetime for such a column, so comparing it against
a freshly-called `datetime.utcnow()` (naive) or a hand-rolled
`datetime.now(UTC).replace(tzinfo=None)` raises `TypeError: can't compare
offset-naive and offset-aware datetimes` the moment two of them meet — this
was live-reproduced via `WorkspaceService.accept_invitation`'s expiry check,
after this function used to strip tzinfo here. Returns the real aware value
instead, so every `core.*` read/write/comparison uses the same shape.

`analytics.*` (Part 3 §3.1) is the opposite convention — deliberately naive,
partitioned wall-clock timestamps (Part 1 §1.10) — and is unaffected: nothing
in that schema calls this helper.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class ReceivedAtWindow:
    """Part 1 §1.10, D-02 — `events_raw` is partitioned by `received_at`, but
    reports filter by `occurred_at`. A query for "last Tuesday" must widen its
    `received_at` bound by a slack window to also catch events that occurred
    that day but arrived late, or it silently undercounts late data instead of
    scanning the (small, adjacent) extra partitions."""

    start: datetime
    end: datetime


def received_at_window(
    occurred_start: datetime, occurred_end: datetime, *, slack_days: int = 3
) -> ReceivedAtWindow:
    slack = timedelta(days=slack_days)
    return ReceivedAtWindow(start=occurred_start - slack, end=occurred_end + slack)


@dataclass(frozen=True)
class LocalDateRange:
    """A property-local calendar range, and its UTC wall-clock equivalents —
    Part 1 §1.8: rollups and "last N days" bucket in property-local time, but
    every `timestamptz` column is compared in UTC."""

    start_date: date
    end_date: date
    start_utc: datetime
    end_utc: datetime


def last_n_days_local(*, timezone: str, days: int) -> LocalDateRange:
    """[today - (days - 1), today] in `timezone`, inclusive — e.g. `days=7`
    is "the last 7 days including today." `end_utc` is now, not local
    midnight tomorrow, so the range never claims data that hasn't happened."""
    tz = ZoneInfo(timezone)
    now_local = datetime.now(tz)
    start_date = now_local.date() - timedelta(days=days - 1)
    start_utc = datetime.combine(start_date, time.min, tzinfo=tz).astimezone(UTC)
    return LocalDateRange(
        start_date=start_date,
        end_date=now_local.date(),
        start_utc=start_utc,
        end_utc=now_local.astimezone(UTC),
    )
