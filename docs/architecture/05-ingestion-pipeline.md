# Part 5 — Ingestion Pipeline (Phase 1: Pragmatic MVP)

Part 2 designed the ingestion pipeline in full: a Redis Stream durability
log, an in-process batch buffer flushing via `COPY`, and an `arq` realtime
indexer worker consuming the stream (D-06). That design is correct for the
traffic volume it targets, and stays the plan for Phase 2. It is also more
infrastructure than a pre-launch product with no real traffic yet needs to
operate correctly — every extra moving part (a stream consumer group, a
buffer flush timer, a worker deployment) is a thing that can silently stop
consuming, with nothing to notice until a dashboard goes stale.

Phase 1 implements Part 2 §2.4's steps 1–8 (validate → resolve property →
bot filter → dedup → enrich → derive visitor hash → resolve session) in full,
against the real schema from Part 3, with no simplification of the
*semantics*. What it drops is step 9's buffering: each event is one
synchronous `INSERT`, committed immediately. This section records that scope
decision and the handful of implementation deviations it implies, so the
plan and the code stay in sync (per the project's standing instruction) and
so Phase 2 has an accurate list of what to add back rather than a redesign.

## 5.1 What's implemented vs. deferred

| Capability | Phase 1 (this part) | Phase 2 (Part 2's original design) |
| --- | --- | --- |
| Write path | One `INSERT ... ON CONFLICT DO NOTHING` per event, committed synchronously | In-process batch buffer, periodic `COPY`, Redis Stream as the durability log (D-06) |
| Realtime index | Updated inline, in the same request that inserts the event | A dedicated `arq` worker consuming the Redis Stream |
| Event dedup | Redis `SET NX EX` (§5.6) with the DB's `ON CONFLICT` as backstop — unchanged from the original design | — |
| Sessionization | Server-derived per Part 1 §1.6, Redis-cached, with a raw-`events_raw` query fallback on a cache miss | Same, plus a batch sessionizer to correct drift Phase 1 has no equivalent for |
| Dictionary encoding | `device_type` / `browser_name` / `os_name` / `channel_group` stored as `text` | `smallint` FKs into `dim_*` tables (Part 3 §3.3) |
| Session facts (bounce rate, duration) | Derived per-query via `GROUP BY session_id` over the raw table | Materialized `analytics.sessions` (Part 3 §3.8) |
| Report/dashboard queries | Raw `events_raw`, range-capped, read directly | Tiered `agg_daily_*` rollups with raw fallback (D-10, Part 3 §3.6) |
| Multi-day unique visitors | Sum of per-day exact `COUNT(DISTINCT visitor_hash)`, flagged `isVisitorsApproximate` | HLL sketches merged across days (Part 3 §3.7) |
| Partition maintenance | Migration pre-creates a 38-day window; `scripts/ensure_partitions.py` is a cron-invoked idempotent fallback | `pg_partman` (D-09) |
| GeoIP | `maxminddb` wired up, returns `None` when no `.mmdb` path is configured | Same, once ops supplies the database file |

Nothing in this list changes a wire contract or a stored value's meaning —
a `text` `device_type` and a `smallint` FK both mean "desktop", and a raw
query and a rollup query answer the same question. Phase 2 is a backend
swap, not a schema migration for existing consumers.

## 5.2 The write path (collector → `IngestionService.ingest`)

`app/collector/main.py`'s `POST /event` calls
`app/services/ingestion_service.py::IngestionService.ingest`, which runs, in
order:

1. **Resolve the property** by `tracking_id` (`PropertyRepository.get_by_tracking_id`).
   Unknown tracking id → drop, log, return (204 regardless — Part 2 §2.5).
2. **Bot filter** (`app/utils/bot_filter.py::is_bot`), only if the property
   has `bot_filtering` enabled.
3. **Dedup claim** — `RealtimeRepository.claim_event_id`, a Redis
   `SET NX EX 86400` keyed by the client-generated event id. A second
   delivery of the same id (retry, double-fire) is dropped here before any
   further work.
4. **Clock handling** — `occurred_at` is parsed and clamped to `received_at`
   if it's malformed or skewed by more than 24h (`_clamp_occurred_at`), with
   a `clock_skew` boolean recorded on the row rather than silently trusting
   or silently discarding a bad client clock.
5. **Enrichment** — page/referrer URL parsing (`app/utils/url.py`), UA
   parsing (`app/utils/user_agent.py`), GeoIP country lookup
   (`app/utils/geoip.py`), channel classification (`app/utils/channel.py`).
6. **Visitor hash** — HKDF-derived daily salt, then
   `BLAKE2b-128(salt || property_id || client_ip || user_agent)`, exactly
   per D-01/D-08 (`app/utils/visitor_hash.py`). No deviation from the
   documented algorithm.
7. **Session resolution** — `_resolve_session` (§5.5).
8. **Insert** — `EventRepository.insert`, one parameterized `INSERT` against
   `analytics.events_raw`, then `session.commit()`.
9. **Realtime index update** — `RealtimeRepository.set_session_state`
   (§5.6), so the realtime endpoint reflects this event immediately.

Any exception past step 1 that isn't one of the expected "drop silently"
cases is caught at the collector's HTTP handler and logged
(`collector_ingest_failed`); the response is still 204, per Part 2 §2.5's
unconditional policy — a stranger's tracking script must never see anything
else.

## 5.3 Why synchronous inserts are acceptable here

Part 2 §2.4's buffer exists to amortize commit overhead across many events
per `COPY`, which matters once ingest volume is high enough that per-event
commit latency becomes the bottleneck. Pre-launch, it isn't: one `INSERT`
against an indexed, partitioned table is well within the collector's latency
budget, and the `ON CONFLICT DO NOTHING` on the partition-key-inclusive
primary key still gives the same at-least-once-delivery, exactly-once-storage
guarantee the buffered design has (D-06's "belt and braces" reasoning is
unaffected by batching). The exit ramp is D-07's reasoning applied one level
down: when per-event commit latency actually shows up in the collector's p99,
`app/services/ingestion_service.py` and `app/repositories/event_repo.py` are
the two files that change — nothing upstream (the request schema) or
downstream (the reporting queries) does.

## 5.4 Dictionary encoding deferred

Part 3 §3.3 dictionary-encodes `device_type`, `browser_name`, `os_name`, and
`channel_group` as `smallint` FKs into `analytics.dim_*` lookup tables,
specifically to keep `events_raw`'s per-row size down at the volumes that
partitioning is designed for. Phase 1 stores these as plain `text`: no
lookup-or-create round trip (with its own cache-invalidation problem) sits on
the write path, and no `dim_*` tables need seeding before the first event can
land. The row-size saving this deviation gives up is real but only matters at
a write volume Phase 1 isn't at yet; backfilling to `smallint` FKs later is a
column-rewrite migration, not a semantic change, and is deferred until actual
volume justifies it (mirrors A-06/A-07's "disclose, don't block" posture).

## 5.5 Sessionization (`IngestionService._resolve_session`)

Implements Part 1 §1.6's rule exactly: a new session starts when there is no
prior event for this visitor, the gap since the last event exceeds the
property's session timeout, the property-local calendar date has changed, or
the UTM source/medium changed from the prior event (a campaign change).

- **Cache hit** (the common case): `RealtimeRepository.get_session_state`
  reads the visitor's Redis hash. If none of the three conditions trip,
  the cached `session_id` is reused; otherwise a new UUID is minted.
- **Cache miss** (cold cache — first event after a Redis restart, or a
  visitor's first event in a new TTL window): falls back to
  `EventRepository.get_last_event_for_visitor`, one indexed query against
  `events_raw` bounded by `received_at >= now - session_timeout`. Phase 1 has
  no batch sessionizer to correct drift the way Phase 2's would, so this
  fallback path is load-bearing correctness, not just an optimization.

## 5.6 Redis's three Phase-1 roles

`app/core/redis.py` and `app/repositories/realtime_repo.py`. Everything
Redis does in Phase 1 fits in "~2 round trips per event" (Part 2 §2.10's
budget): the dedup `SET`, and one pipelined `HSET` + `EXPIRE` + `ZADD` that
covers both remaining roles at once.

1. **Event dedup** — `dedup:{event_id}` (§5.2 step 3). Unchanged from the
   original design; this was never part of D-06's deferred half.
2. **Session cache** — `rt:{property_id}:visitor:{hash}`, a hash carrying
   `session_id`, `started_at`, `last_seen_epoch`, `local_date`,
   `utm_source`/`utm_medium` (§5.5's inputs).
3. **Realtime index** — the *same* hash also carries `page_path` and
   `country_code`, and a companion sorted set
   `rt:{property_id}:active` (visitor hash → last-seen epoch) tracks who
   counts as active. Reading "who's active right now" is a bounded
   `ZRANGE` after trimming stale entries with `ZREMRANGEBYSCORE`, followed by
   a pipelined fan-out `HMGET` per active visitor to build the page/country
   breakdown as an in-process `Counter`.

Point 3 is a deliberate implementation choice, not dictated by Part 2 §2.7:
the documented design has a dedicated realtime indexer worker maintaining
incremental `ZINCRBY` leaderboards per page/country. That has a correctness
bug hiding in it — a visitor navigating from page A to page B must decrement
A's count, not just increment B's, and an incremental counter has no way to
know what a visitor's *previous* page was without itself reading state back.
The fan-out read sidesteps that entirely (each visitor's current page is
just whatever their hash currently says), at the cost of reading every active
visitor's hash on every realtime request — cheap, because the active set is
bounded by concurrent visitors, not total traffic. Phase 2's worker, if it's
still wanted once there's an `arq` deployment to put it in, should keep this
fan-out-read design rather than reintroducing the leaderboard bug.

## 5.7 Read path — reports and dashboard

`app/repositories/reports_repo.py`, `app/services/reports_service.py`. Both
the Tier-1 breakdown endpoint and the dashboard summary read
`analytics.events_raw` directly, range-capped to
`analytics.raw_query_range_cap_days` (property-local "last N days", via
`last_n_days_local`), with the `received_at` window widened by the Part 1
§1.10 slack (`received_at_window`, default 3 days) while `occurred_at` is
filtered for the actual requested range. This is exactly what Part 3 §3.5
already says raw-event queries are for — a range-capped scan of a few
partitions is acceptable; it stops being acceptable once real traffic makes
that scan slow, which is D-10's promotion trigger for building the first
`agg_daily_*` rollup. `reports_repo.py` is the one place that changes when
that happens.

There is no `analytics.sessions` table yet (Part 3 §3.8): session counts and
bounce rate are derived per-query via `GROUP BY session_id` over the capped
window (a `session_totals` CTE reused by both the breakdown and the summary
query) rather than read from a maintained table.

Multi-day unique visitors have no HLL sketch to merge (Part 3 §3.7 is not
built yet), so `dashboard_totals` sums per-day exact `COUNT(DISTINCT
visitor_hash)` — an over-count across days, because the visitor hash rotates
daily by design (D-01). `DashboardSummary.isVisitorsApproximate` is `true`
whenever the requested range spans more than one property-local day, so the
frontend renders a caveat instead of a bare, wrong-looking-precise number
(Action A-07).

## 5.8 Realtime endpoint

`app/api/v1/realtime.py` → `RealtimeService.get_snapshot` →
`RealtimeRepository.get_active_snapshot` (§5.6, point 3). Entirely
Redis-backed — no Postgres query on this path — matching Part 2 §2.7's
"realtime reads from Redis, not Postgres" design.

## 5.9 Partition management

Part 3 §3.4 / D-09 prefers `pg_partman`, with a worker-job fallback, and
always a `DEFAULT` partition with an alert if it's ever non-empty. Phase 1
has no worker deployment to run a scheduled job in, so:

- `migrations/versions/0002_analytics_events_raw.py` creates the partitioned
  table with a 38-day window pre-created (today − 3 to today + 34) at
  migration time — enough runway that the fallback script isn't
  load-bearing from day one.
- `scripts/ensure_partitions.py` is that fallback, invoked by an external
  cron rather than an in-process worker: idempotent (checks `pg_inherits`
  for existing partitions before creating any), and it checks
  `analytics.events_raw_default` row count on every run, exactly per
  Part 3 §3.4's alerting requirement.

Both were run against the project's shared dev database as part of building
this part, not just written and assumed correct: the migration produced 39
partitions with the expected indexes and column types, and the script was
debugged through two real bugs (a DDL parameter-binding error from
parameterizing a `FOR VALUES FROM/TO` clause, and a false "created N
partitions" report caused by `CREATE TABLE IF NOT EXISTS` always returning
the same status tag) until a second run correctly reported "no new
partitions needed."

## 5.10 Deviations from the decision register

None of D-06, D-09, or D-10 are reversed — Phase 1 is a scoped subset of
each, not a disagreement with them. Recorded here so a future reader hits
this section instead of re-deriving "why doesn't the code match Part 2" from
scratch:

| Register entry | What it says | What Phase 1 actually does |
| --- | --- | --- |
| D-06 | Batch buffer + Redis Stream + reconciliation job | Synchronous per-event insert; Stream and buffer deferred (§5.3) |
| D-09 | `pg_partman`, worker fallback | Migration-time pre-creation + cron-invoked script (§5.9) |
| D-10 | Tiered rollups, raw fallback | Raw-only; no rollup tier exists yet (§5.7) |
| Part 3 §3.3 | `smallint` dictionary-encoded columns | Plain `text` (§5.4) |
| Part 3 §3.7 | HLL sketches for multi-day uniques | Summed daily exact counts, flagged approximate (§5.7) |
| Part 3 §3.8 | Materialized `analytics.sessions` | Derived per-query from `events_raw` (§5.7) |

## 5.11 What Phase 2 adds, in order

1. **`agg_daily_*` rollups** once a real range scan is measurably slow
   (D-10's trigger) — the first, highest-leverage change, since it's the one
   the read path already has an exit ramp for.
2. **HLL sketches** on the rollup write path, closing the
   `isVisitorsApproximate` gap.
3. **`analytics.sessions`**, materializing what `session_totals` currently
   recomputes per query.
4. **Redis Stream + batch buffer + `arq` worker**, once collector p99 or
   Postgres write load actually motivates it — at which point the fan-out
   realtime read design (§5.6) should be kept, not replaced by the
   originally-documented incremental leaderboard.
5. **`smallint` dictionary encoding**, as a backfill migration once row
   count makes the saving worth the lookup-table complexity.
6. **`pg_partman`**, replacing `scripts/ensure_partitions.py` once there's an
   operational surface (Part 10) to install and monitor it in.
