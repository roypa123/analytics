"""Part 3 §3.4, D-09 mechanism 2 — the portable fallback for partition
maintenance. `migrations/versions/0002_analytics_events_raw.py` pre-creates a
window of daily partitions at migration time; that window is finite and WILL
run out. Until pg_partman or a real arq worker exists (Phase 2), run this
script on a schedule (daily cron is plenty, given the default window) to
extend the rolling window of future partitions.

Idempotent: `CREATE TABLE IF NOT EXISTS` per day, safe to re-run.

    python -m scripts.ensure_partitions [--days-ahead 34]
"""

import argparse
import sys
from datetime import date, timedelta

import psycopg

from app.core.config import get_settings

_DEFAULT_DAYS_AHEAD = 34


def ensure_partitions(dsn: str, *, days_ahead: int) -> list[str]:
    created: list[str] = []
    today = date.today()
    with psycopg.connect(dsn, autocommit=True) as conn, conn.cursor() as cur:
        # `CREATE TABLE IF NOT EXISTS` reports the "CREATE TABLE" status tag
        # whether or not it actually created anything, so existence has to be
        # checked explicitly to report accurately.
        cur.execute(
            """
            SELECT c.relname FROM pg_inherits i
            JOIN pg_class c ON c.oid = i.inhrelid
            WHERE i.inhparent = 'analytics.events_raw'::regclass
            """
        )
        existing = {row[0] for row in cur.fetchall()}

        for offset in range(days_ahead + 1):
            day = today + timedelta(days=offset)
            next_day = day + timedelta(days=1)
            name = f"events_raw_{day.strftime('%Y%m%d')}"
            if name in existing:
                continue
            # Values are internally generated dates, not user input — safe to
            # inline. DDL parameter placeholders can't be type-inferred here
            # (Postgres has no query shape to infer them from).
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS analytics.{name}
                PARTITION OF analytics.events_raw
                FOR VALUES FROM ('{day.isoformat()}') TO ('{next_day.isoformat()}')
                """
            )
            created.append(name)

        # A non-empty DEFAULT partition means partition creation has fallen
        # behind — Part 3 §3.4's "alert if it ever contains rows."
        cur.execute("SELECT count(*) FROM analytics.events_raw_default LIMIT 1")
        default_count = cur.fetchone()[0]
        if default_count:
            print(
                f"WARNING: analytics.events_raw_default has {default_count} row(s) — "
                "partition creation has fallen behind and is silently degrading "
                "query pruning. See Part 3 §3.4.",
                file=sys.stderr,
            )

    return created


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days-ahead", type=int, default=_DEFAULT_DAYS_AHEAD)
    args = parser.parse_args()

    settings = get_settings()
    # psycopg3's connect() takes a plain postgresql:// DSN, not SQLAlchemy's
    # driver-qualified postgresql+psycopg:// URL.
    dsn = settings.database.sync_dsn.replace("postgresql+psycopg://", "postgresql://")
    created = ensure_partitions(dsn, days_ahead=args.days_ahead)
    if created:
        print(f"Created {len(created)} partition(s): {', '.join(created)}")
    else:
        print("No new partitions needed.")


if __name__ == "__main__":
    main()
