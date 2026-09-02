# Part 3 — Database Architecture

> Depends on: Part 1 (event model, metrics), Part 2 (D-02 partition key, D-07 Postgres).
> Feeds: Part 4 (repositories), Part 6 (rollup jobs), Part 9 (migrations).

---

## 3.1 Two schemas, one database

```
core.*        — OLTP. Low volume, high value, strongly constrained.
                accounts, workspaces, memberships, properties, goals,
                segments, api_keys, invitations, audit_log

analytics.*   — OLAP. High volume, append-mostly, denormalized.
                events_raw (partitioned), sessions (partitioned),
                agg_hourly, agg_daily, agg_daily_pages, …
```

**Why separate schemas rather than one flat namespace.** Different backup
priorities (core is small enough for frequent logical dumps; analytics is
restored from PITR), different grant sets (the collector role needs `INSERT` on
`analytics.events_raw` and `SELECT` on `core.properties` and nothing else),
different migration risk profiles, and it makes the layering visible in every
query. Part 9 §9.7 uses the schema split to gate which migrations require a
maintenance window.

**Why not separate databases.** We would lose foreign keys from
`analytics.sessions` to `core.properties`, lose cross-schema joins for
property metadata in reports, and double the operational surface. The schema
boundary gives most of the isolation benefit at none of that cost.

---

## 3.2 Core schema

Abbreviated DDL — full column lists live in the migration, this is the shape and
the reasoning.

```sql
CREATE TABLE core.accounts (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email           citext NOT NULL UNIQUE,
    password_hash   text,                        -- null if SSO-only
    full_name       text NOT NULL,
    email_verified_at  timestamptz,
    mfa_secret      bytea,                       -- encrypted at rest
    status          text NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.workspaces (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            text NOT NULL,
    slug            citext NOT NULL UNIQUE,
    plan            text NOT NULL DEFAULT 'free',
    event_quota_monthly  bigint NOT NULL DEFAULT 100000,
    created_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

CREATE TABLE core.memberships (
    workspace_id    bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    account_id      bigint NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('owner','admin','analyst','viewer')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, account_id)
);

CREATE TABLE core.properties (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id    bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    name            text NOT NULL,
    tracking_id     text NOT NULL UNIQUE,        -- public; goes in the snippet
    domain          text NOT NULL,
    timezone        text NOT NULL DEFAULT 'UTC', -- IANA name; see Part 1 §1.8
    currency        char(3) NOT NULL DEFAULT 'USD',
    excluded_ips    inet[] NOT NULL DEFAULT '{}',
    excluded_paths  text[] NOT NULL DEFAULT '{}',
    bot_filtering   boolean NOT NULL DEFAULT true,
    retention_days  int NOT NULL DEFAULT 90,
    cache_epoch     bigint NOT NULL DEFAULT 0,   -- Part 2 §2.6 invalidation
    created_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
CREATE INDEX ON core.properties (workspace_id) WHERE deleted_at IS NULL;
```

Notes on choices:

- **`citext` for email and slug.** Case-insensitive uniqueness enforced by the
  database, not by remembering to `.lower()` in every code path. Requires
  `CREATE EXTENSION citext`.
- **`GENERATED ALWAYS AS IDENTITY` over `serial`.** The modern standard form;
  `serial` has awkward ownership semantics on the underlying sequence.
- **`bigint` primary keys everywhere**, including on tables that will never
  have 2 billion rows. Consistency matters more than the four bytes, and
  `property_id` in particular is copied onto every event row where the type
  must match.
- **Soft delete (`deleted_at`) on workspaces and properties.** Deleting a
  property must not synchronously delete 90 days of events — that is a
  multi-minute lock. Soft-delete immediately, let the retention worker reclaim
  asynchronously (§3.10).
- **`text` + `CHECK` for role, not an enum.** Postgres enums require a
  migration with an exclusive lock to add a value, and roles are exactly the
  kind of thing product will want to extend. A `CHECK` constraint is a fast
  validated-not-valid two-step. (Note this mirrors the frontend's
  no-TS-enum constraint from Part 0 F-03 — the same value set is a `const`
  object there and a `CHECK` here, both driven from the shared definition in
  Part 8 §8.6.)

---

## 3.3 `analytics.events_raw` — the hot table

```sql
CREATE TABLE analytics.events_raw (
    event_id        uuid        NOT NULL,
    property_id     bigint      NOT NULL,
    received_at     timestamptz NOT NULL,   -- PARTITION KEY (Part 1 §1.10)
    occurred_at     timestamptz NOT NULL,
    event_name      text        NOT NULL,
    session_id      uuid,                   -- assigned by sessionizer
    visitor_hash    bytea       NOT NULL,   -- 16 bytes, BLAKE2b-128
    user_id         text,

    -- page
    page_path       text,
    page_query      text,
    page_hostname   text,
    page_title      text,
    referrer_domain text,
    referrer_path   text,

    -- campaign
    utm_source      text,
    utm_medium      text,
    utm_campaign    text,
    utm_term        text,
    utm_content     text,
    channel_group   smallint,               -- see §3.4 on dictionary encoding

    -- device
    device_type     smallint,
    browser_name    smallint,
    browser_version text,
    os_name         smallint,
    os_version      text,
    screen_width    int,
    viewport_width  int,

    -- geo
    country_code    char(2),
    region_code     text,
    city_geoname_id int,

    -- flags + extensibility
    is_bot          boolean NOT NULL DEFAULT false,
    clock_skew      boolean NOT NULL DEFAULT false,
    properties      jsonb,

    PRIMARY KEY (property_id, received_at, event_id)
) PARTITION BY RANGE (received_at);
```

### On the primary key

`(property_id, received_at, event_id)` — the partition key **must** be part of
any unique constraint on a partitioned table, which is why `received_at` is in
there. Leading with `property_id` means the index is clustered by tenant, which
matches every query's access pattern (every report filters
`property_id = ?`).

This PK also gives us the Part 1 §1.9 dedup backstop for free.

### On column ordering

The DDL above is written for readability. The **migration should emit columns
ordered by alignment**: 8-byte types first, then 4-byte, then 2-byte, then
1-byte, then variable-length. Postgres pads each column to its alignment
boundary, and naive ordering wastes 8–15% of the row. On a table taking ~200 GB
in the hot window, that is 20–30 GB of pure padding.

> **Action item A-06.** The `events_raw` migration must include a comment
> explaining that column order is alignment-driven and must not be
> "tidied." This is exactly the kind of thing a well-meaning refactor breaks.

### On dictionary encoding

`channel_group`, `device_type`, `browser_name`, and `os_name` are `smallint`
referencing small lookup tables rather than `text`.

**Why.** There are perhaps 300 distinct browser names and 8 device types, but
170M rows/day. Storing `"Chrome"` as text costs 7 bytes plus overhead per row;
a `smallint` costs 2. Across the hot window this is tens of gigabytes, and
smaller rows mean more rows per page, which means fewer pages read per
aggregate scan — the saving compounds into query time, not just disk.

**Why not for `page_path` and `utm_*`.** Their cardinality is unbounded and
site-specific. A dictionary would grow without limit and every insert would
need a lookup-or-create round trip on the hot write path. Keep them as `text`.

The lookup tables live in `analytics.dim_*` and are cached in-process in both
the collector (to encode) and the API (to decode). New values are added by the
collector via an upsert into the dimension table — rare enough not to matter.

---

## 3.4 Partitioning `events_raw`

**Scheme:** range partitions on `received_at`, **one per day**.

| Interval | Partitions in 90-day window | Rows/partition at target | Verdict |
| --- | --- | --- | --- |
| Hourly | 2,160 | ~7 M | Too many; planning time degrades noticeably past ~1,000 |
| **Daily** | **90** | **~170 M** | **Chosen** |
| Weekly | 13 | ~1.2 B | Partitions too large to detach/vacuum cheaply; poor pruning granularity |
| Monthly | 3 | ~5 B | Unusable |

Daily also aligns with the retention unit (Part 1 §1.3: 90 days) and with the
daily rollup boundary, so "drop the oldest day" is exactly one `DETACH` +
`DROP`.

### Sub-partitioning by property — rejected

Tempting: `PARTITION BY RANGE (received_at) SUBPARTITION BY HASH (property_id)`.
It would give better locality for large tenants.

Rejected because partition count multiplies (90 days × 16 hash buckets = 1,440
partitions), planning time suffers, and every DDL operation — including every
future migration — has to touch 16× as many objects. The `property_id`-leading
primary key already gives us tenant locality within a partition, which captures
most of the benefit.

Revisit only if a single tenant grows to dominate the table, at which point the
right answer is probably a dedicated partition for that tenant via `LIST`
sub-partitioning, not blanket hashing.

### Partition management

Partitions must exist *before* data arrives, or inserts fail. Three mechanisms,
in order of preference:

1. **`pg_partman`** — a mature extension that maintains a rolling window of
   pre-created future partitions and retention-drops old ones. If the hosting
   allows the extension, use it. This is the recommended path.
2. **A scheduled worker job** (Part 6 §6.7) that runs nightly, ensures the next
   14 days of partitions exist, and detaches expired ones. Written in
   application code, versioned with the app, no extension dependency.
3. **A `DEFAULT` partition as a safety net.** Catches rows that would otherwise
   error.

> **Decision D-09.** Use `pg_partman` where available, with the worker job
> (mechanism 2) as the portable fallback. **Always** create a `DEFAULT`
> partition, and **alert if it ever contains rows** — a non-empty default
> partition means partition creation has failed and is silently degrading
> query pruning.

The default-partition alert matters more than it sounds. Without it, a failed
partition-creation job doesn't break anything visibly; it just quietly funnels
every new event into an unpruned, unindexed catch-all, and the dashboard gets
slower and slower for reasons nobody can find.

Note also: attaching a new partition when a `DEFAULT` exists requires Postgres
to scan the default partition to verify no rows belong in the new range. Keep
the default empty and this is instant; let it fill and partition maintenance
starts taking locks for minutes. Part 9 §9.8.

---

## 3.5 Indexing `events_raw`

Index strategy on a table with this write rate is mostly an exercise in
restraint. **Every index is a tax on every insert.** The rollup workers are the
main reader, and they scan sequentially by time.

```sql
-- The PK already provides (property_id, received_at, event_id).

-- BRIN on occurred_at: reporting filters on occurred_at, and because
-- received_at ≈ occurred_at, the physical ordering correlates well.
CREATE INDEX events_raw_occurred_brin
    ON analytics.events_raw USING BRIN (occurred_at) WITH (pages_per_range = 32);

-- Sessionizer's access pattern: one visitor's recent events.
CREATE INDEX events_raw_sessionize
    ON analytics.events_raw (property_id, visitor_hash, occurred_at)
    WHERE session_id IS NULL;

-- Partial index for the goal/conversion path (Tier 2), tiny by comparison.
CREATE INDEX events_raw_named
    ON analytics.events_raw (property_id, event_name, occurred_at)
    WHERE event_name <> 'pageview';
```

**BRIN, not B-tree, on `occurred_at`.** A B-tree over 170M rows/day is several
gigabytes per partition and costs write throughput. BRIN is kilobytes — it
stores min/max per block range — and because the table is physically ordered by
insertion time (which correlates with `occurred_at`), it prunes effectively.
BRIN is a near-perfect fit for append-only time-series and a poor fit for
almost anything else.

**The partial index on `session_id IS NULL`** is the key to a cheap sessionizer:
it indexes only the small backlog of unsessionized events, and rows drop out of
the index as they are processed. This is far better than a full index on
`(property_id, visitor_hash, occurred_at)`.

**No GIN index on `properties`.** Part 1 §1.5 explains the tradeoff. GIN
maintenance at this write rate is prohibitive.

**No index on `page_path`, `country_code`, `utm_*`, etc.** Reports never scan
raw events by those columns — they read rollups. If a raw-event query needs
them, it is a range-capped exploration query and a sequential scan of a few
partitions with parallel workers is acceptable.

> The general rule: **`events_raw` is optimized for write and for sequential
> rollup consumption. All read optimization happens in the aggregate tables.**

---

## 3.6 The aggregation strategy — and the combinatorial problem

This is the hardest design decision in the database layer.

### The problem

Reports want arbitrary combinations: pageviews by country, by country ×
device, by source × landing page, filtered to mobile users from organic search.
With 12 dimensions, materializing every combination is 2¹² = 4,096 rollup
tables. Obviously impossible.

### The rejected approaches

**Full cube.** Materialize every combination. Combinatorially impossible.

**Single wide rollup at full dimensionality.** One table keyed by
`(property_id, bucket, dim1, …, dim12)`. Sounds elegant — you can `GROUP BY` any
subset. But the row count is the *product* of cardinalities: with 5,000 pages ×
100 countries × 3 devices × 50 sources, a single day for one property could
produce more rows than it had events. The aggregate becomes bigger than the
raw data, which is the exact opposite of the point.

**No pre-aggregation, index the raw table heavily.** Fails the write budget and
the p95 query budget simultaneously.

### The chosen approach: tiered, purpose-built rollups

Materialize a small number of rollups chosen to cover the actual Tier-1 report
set, sized by observed cardinality rather than theoretical combinations.

```sql
-- Tier A: the totals table. One row per property per bucket.
-- Answers every headline number and every time-series chart. Tiny.
CREATE TABLE analytics.agg_daily_totals (
    property_id     bigint NOT NULL,
    local_date      date   NOT NULL,        -- property-local (Part 1 §1.8)
    pageviews       bigint NOT NULL DEFAULT 0,
    sessions        bigint NOT NULL DEFAULT 0,
    bounces         bigint NOT NULL DEFAULT 0,
    session_seconds bigint NOT NULL DEFAULT 0,
    visitors_hll    bytea,                  -- HLL sketch, see §3.7
    visitors_exact  bigint,                 -- exact for this single day
    PRIMARY KEY (property_id, local_date)
);

-- Tier B: one table per high-value single dimension.
-- Row count = cardinality of that dimension, per property per day.
CREATE TABLE analytics.agg_daily_by_page (
    property_id bigint NOT NULL,
    local_date  date   NOT NULL,
    page_path   text   NOT NULL,
    pageviews   bigint NOT NULL DEFAULT 0,
    sessions    bigint NOT NULL DEFAULT 0,
    entries     bigint NOT NULL DEFAULT 0,
    exits       bigint NOT NULL DEFAULT 0,
    bounces     bigint NOT NULL DEFAULT 0,
    visitors_hll bytea,
    PRIMARY KEY (property_id, local_date, page_path)
);
-- …and the same shape for: by_referrer, by_source (utm/channel),
--    by_country, by_device, by_browser, by_os, by_event_name

-- Tier C: a small number of two-dimension crosses that reports actually use.
-- Chosen from the report inventory, not speculatively.
CREATE TABLE analytics.agg_daily_source_x_landing ( … );
CREATE TABLE analytics.agg_daily_country_x_device ( … );
```

And the same three tiers at hourly granularity for today/realtime-adjacent
ranges, with a shorter retention (hourly rollups keep 14 days; beyond that,
daily suffices).

### Why this works

The row counts are bounded by *sum* of cardinalities, not product. For a
property with 5,000 pages, 100 countries, 3 devices, 20 browsers, 200
referrers, one day produces roughly 5,300 rollup rows instead of 500,000
events — a 100× reduction, and 5,300 × 90 days = 477,000 rows is trivially
queryable.

### The honest limitation

**Arbitrary filter + arbitrary breakdown is not supported by rollups.** "Top
pages, filtered to mobile users from Germany" is a two-dimensional slice that
`agg_daily_by_page` cannot answer.

Three-part answer:

1. **The registry (Part 1 §1.12) knows this.** Each rollup declares which
   dimensions it carries. The planner routes a request to a rollup only if the
   rollup can actually answer it.
2. **Requests that no rollup covers fall through to raw events**, with an
   enforced range cap (default 7 days), a statement timeout, and a per-workspace
   concurrency limit. They are slower — 2–5 s — and the UI shows a
   "computing over raw data" state rather than pretending otherwise.
3. **Usage telemetry drives Tier C.** We log which (dimension, filter)
   combinations fall through to raw. Combinations that appear frequently get
   promoted to a new Tier-C rollup. This is a deliberate feedback loop, not a
   one-time guess, and it is the mechanism that keeps the rollup set small
   *and* well-targeted.

> **Decision D-10.** Tiered purpose-built rollups with raw-event fallback and
> usage-driven promotion. Rejected the full-cube and single-wide-table
> alternatives for the row-count reasons above. The cost is that some queries
> are slow; the mitigation is that we measure which ones and fix those
> specifically.

---

## 3.7 Multi-day unique visitors — HyperLogLog

Part 1 §1.7 established that daily-rotating hashes make multi-day uniques
impossible to compute exactly. The `postgresql-hll` extension solves the
tractable half of the problem.

```sql
CREATE EXTENSION hll;
-- visitors_hll columns are hll type (shown as bytea above for portability)
```

Each rollup row carries an HLL sketch of that bucket's visitor hashes. Merging
is associative:

```sql
SELECT hll_cardinality(hll_union_agg(visitors_hll))
FROM   analytics.agg_daily_totals
WHERE  property_id = $1 AND local_date BETWEEN $2 AND $3;
```

**What this gives:** ~±2% error at default precision (log2m=11), a fixed ~1.3 KB
per sketch regardless of cardinality, and O(number of days) merge cost.

**What it does not fix:** the same person still has a different hash each day,
so a 30-day "unique visitors" number counts a daily visitor ~30 times. **HLL
solves sketch merging, not identity.** The multi-day number is "unique
visitor-days, deduplicated within each day," which is a genuinely different
thing from "unique people."

> **Action item A-07.** This must be stated in the UI, not buried. The
> multi-day unique-visitor figure needs an explicit tooltip explaining both the
> ±2% sketch error and the daily-identity semantics. Shipping a number labelled
> "Unique visitors: 48,201" that means something other than what every user
> will assume is a trust problem, and trust is the entire product.

If a property opts into `user_id` (Part 1 §1.7), we additionally maintain
`users_hll` over `user_id`, which *is* a true cross-day unique count for the
identified subset.

**Fallback if `hll` is unavailable.** Some managed Postgres offerings do not
ship it. The fallback is a per-day sorted array of truncated hashes for
low-cardinality properties and an approximate `COUNT(DISTINCT)` over raw events
(range-capped) otherwise — noticeably worse. Verify extension availability
during infrastructure selection; this is a hosting requirement, not an
afterthought.

---

## 3.8 `analytics.sessions`

```sql
CREATE TABLE analytics.sessions (
    session_id      uuid        NOT NULL,
    property_id     bigint      NOT NULL,
    started_at      timestamptz NOT NULL,   -- PARTITION KEY
    ended_at        timestamptz NOT NULL,
    local_date      date        NOT NULL,   -- property-local day of started_at
    visitor_hash    bytea       NOT NULL,
    user_id         text,

    pageview_count  int    NOT NULL DEFAULT 0,
    event_count     int    NOT NULL DEFAULT 0,
    duration_seconds int   NOT NULL DEFAULT 0,
    is_bounce       boolean NOT NULL DEFAULT true,

    entry_page      text,
    exit_page       text,

    -- first-touch attribution, frozen at session start
    referrer_domain text,
    utm_source      text,
    utm_medium      text,
    utm_campaign    text,
    channel_group   smallint,

    country_code    char(2),
    device_type     smallint,
    browser_name    smallint,
    os_name         smallint,

    is_finalized    boolean NOT NULL DEFAULT false,

    PRIMARY KEY (property_id, started_at, session_id)
) PARTITION BY RANGE (started_at);
```

**Why a materialized sessions table at all.** Bounce rate, session duration,
entry page, and exit page all require window functions over the raw event
stream. Computing those per query, over 90 days, is exactly the kind of thing
that blows the p95 budget. Materializing them once in the sessionizer turns
every session-scoped report into a simple aggregate over a table two orders of
magnitude smaller than `events_raw`.

**`is_finalized`.** A session is open until 30 minutes of inactivity have
passed. Until then its duration and exit page can change. The flag lets queries
distinguish settled rows from in-flight ones, and lets the sessionizer find
work efficiently. Rollups only consume finalized sessions; today's partial
numbers come from the hourly path.

**Sessions are partitioned by `started_at`, not `received_at`.** Unlike events,
sessions are *updated* (as events arrive), so the immutable-old-partition
argument does not apply in the same way. Partitioning by start time keeps a
session's row in one partition for its whole life, which matters because
cross-partition `UPDATE` on a partitioned table means delete-plus-insert and
requires row movement to be enabled.

**On the immutable-timezone rule (Part 1 §1.8).** `local_date` is denormalized
here and in every rollup. That is precisely why changing a property's timezone
requires a full rebuild rather than a settings toggle — the value is baked into
millions of rows.

---

## 3.9 Retention and archiving

| Data | Retention | Mechanism |
| --- | --- | --- |
| `events_raw` | 90 days (per-property override) | `DETACH` + `DROP` partition, nightly |
| `sessions` | 400 days | `DETACH` + `DROP` partition |
| `agg_hourly_*` | 14 days | `DELETE` by `local_date` (small enough) |
| `agg_daily_*` | 25 months (Part 1 §1.3) | `DELETE` by `local_date` |
| `core.audit_log` | 24 months | `DELETE` |

**`DETACH CONCURRENTLY` then `DROP`, not `DELETE`.** A `DELETE` of 170M rows
generates enormous WAL, bloats the table, and requires a subsequent `VACUUM`
that competes with ingestion. Dropping a partition is a catalog operation —
effectively instant, no WAL for the data, no bloat. This is the single biggest
operational reason to partition.

`DETACH CONCURRENTLY` (Postgres 14+) avoids taking an `ACCESS EXCLUSIVE` lock on
the parent table, which would otherwise block every concurrent insert. On a
table taking 2,000 writes/sec, a blocking detach is an outage.

**Per-property retention.** Different plans get different windows, but
partitions are global. Resolution: partitions are dropped at the *maximum*
retention across all properties; properties with shorter retention have their
rows deleted by a targeted `DELETE ... WHERE property_id = ANY(...)` on the
partitions between their limit and the global limit. Those deletes are small
relative to the partition and can be batched. The alternative — per-property
partitioning — was rejected in §3.4.

**Archiving before drop.** Before a partition is dropped, it is exported to
object storage as Parquet (partitioned by property) if the workspace's plan
includes raw-data archival. This is a worker job (Part 6 §6.7) that runs
before the retention job and must succeed for the drop to proceed. The archive
is not queryable by the product — it exists for customer export and for
disaster recovery of the aggregation pipeline.

---

## 3.10 Deleting a property or workspace

Part 3 §3.2 established soft-delete. The asynchronous reclaim:

1. `deleted_at` is set. The property immediately disappears from the API, and
   the collector's property cache is invalidated so new events are rejected.
2. A nightly worker finds properties soft-deleted more than 7 days ago (a grace
   window for accidental deletion) and:
   - deletes rollup rows (`DELETE FROM ... WHERE property_id = $1`, batched),
   - deletes session rows, batched by partition,
   - deletes raw event rows, batched by partition, with a sleep between
     batches to avoid saturating I/O,
   - finally hard-deletes the `core.properties` row.
3. Progress is checkpointed so the job is resumable.

**Batched with backpressure, not one big transaction.** A single `DELETE` of a
large property's 90 days of events would hold locks and generate WAL for
minutes. The job deletes in chunks of ~10,000 rows, commits, and yields.

GDPR erasure requests for an individual are a different and harder problem —
see Part 10 §10.8. (Short version: because we store no PII and no reversible
identifier, there is generally nothing to erase, which is a significant benefit
of the Part 1 §1.7 identity model.)

---

## 3.11 Custom event properties

Part 1 §1.5 deferred the detail. The design:

**Storage.** `properties jsonb` on `events_raw`, unindexed.

**Registration.** A property owner declares which custom-property keys matter
via `core.registered_properties (property_id, event_name, key, value_type)`.

**Promotion.** Registered keys get their own Tier-B rollup:
`agg_daily_by_custom_prop (property_id, local_date, event_name, prop_key,
prop_value, count, …)`. The rollup worker extracts only registered keys.

**Guardrails**, because an unbounded `jsonb` bag on the hot path is a
denial-of-service vector:

- Max 32 keys per event; excess dropped and counted.
- Max 512 bytes per value, 8 KB per bag.
- Max 100 registered keys per property.
- Values exceeding a cardinality threshold (say 10,000 distinct per day) stop
  being rolled up and are flagged in the UI as high-cardinality — otherwise a
  customer who registers `order_id` as a property generates one rollup row per
  event and defeats the entire aggregation strategy.

That last guardrail is the one that will actually fire in production, and it
needs a real UI affordance, not just a log line.

---

## 3.12 Connection management

At 2,000 events/sec across 3 collector replicas plus API and worker traffic,
connection count becomes a real constraint — Postgres allocates significant
memory per backend and degrades past a few hundred.

| Service | Pool size per replica | Notes |
| --- | --- | --- |
| Collector | 5 | Only the batch flusher uses connections; the request path uses none |
| API | 20 | Report queries; goes to the replica |
| API (primary) | 5 | Settings writes |
| Worker | 10 | Long-running jobs |

**PgBouncer in transaction mode** sits in front of the primary. This matters
particularly for the collector, whose connections are idle almost all the time
between flushes.

**Constraint:** transaction-mode pooling forbids session-level state —
prepared statements (in the session sense), `SET`, advisory locks held across
transactions, and `LISTEN`/`NOTIFY`. SQLAlchemy's asyncpg dialect must be
configured with `statement_cache_size=0` and a `prepared_statement_name_func`
that generates unique names, or connections will fail intermittently with
"prepared statement already exists" — a maddening, load-dependent bug.

> **Action item A-08.** The asyncpg + PgBouncer transaction-mode configuration
> must be set correctly in the very first database module. It fails only under
> concurrency, so it passes local testing and breaks in staging.

Advisory locks for job singleton-guarding (Part 6 §6.9) must therefore use a
**dedicated non-pooled connection**, bypassing PgBouncer.

---

## 3.13 What Part 4 must resolve

Part 3 has fixed the storage. Part 4 must specify the code that reaches it: the
FastAPI layering, which layer owns transactions (a question Part 3's batched
deletes and multi-table rollup writes make concrete), how the repository
interface keeps the Part 2 §2.8 ClickHouse exit ramp open, and how the metric
registry compiles into the SQL this part has designed for.
