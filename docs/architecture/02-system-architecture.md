# Part 2 — System Architecture

> Depends on: Part 1 (§1.3 targets, §1.6 sessionization, §1.10 partition key).
> Feeds: Part 3, 4, 5, 6, 10.

---

## 2.1 The central tension

The non-functional targets in Part 1 §1.3 pull in two directions:

- **Write path:** 10,000 events/sec peak, p99 < 50 ms, 99.9% availability,
  data loss is unrecoverable.
- **Read path:** complex multi-dimensional aggregations over 90 days, p95 <
  500 ms, occasional heavy exploration queries.

These are different workloads with different failure modes and different
scaling curves. A single FastAPI service and a single Postgres connection pool
serving both means a slow dashboard query can exhaust the pool and start
dropping events. That is the failure we must design out.

The architecture below is organized entirely around **keeping the write path
independent of the read path**.

---

## 2.2 Topology

```
                    ┌─────────────────────────────────────┐
   Browser ────────▶│  CDN edge  (tracker.js, cached)     │
      │             └─────────────────────────────────────┘
      │  POST /api/event
      ▼
┌──────────────────────────────────────────────────────────────┐
│  COLLECTOR SERVICE            (FastAPI, N replicas)          │
│  ─────────────────────────────────────────────────────────   │
│  validate → bot filter → dedup(Redis) → enrich(geo/UA)       │
│  → assign visitor_hash → session lookup(Redis) → BUFFER      │
│                                                              │
│  Returns 204 as soon as the event is in the buffer.          │
│  No synchronous Postgres write. No dependency on the API.    │
└───────────────┬──────────────────────────┬───────────────────┘
                │                          │
        in-proc batch buffer          Redis Streams
        (flush: 1000 rows / 500ms)    (realtime + durability)
                │                          │
                ▼                          ▼
        ┌───────────────┐         ┌──────────────────┐
        │  PostgreSQL   │         │  Realtime index  │
        │  events_raw   │         │  (Redis, 30 min) │
        │  (partitioned)│         └────────┬─────────┘
        └───────┬───────┘                  │
                │                          │
                ▼                          │
┌──────────────────────────────────────────┼───────────────────┐
│  WORKER SERVICE   (arq, M replicas)      │                   │
│  ────────────────────────────────────    │                   │
│  • sessionizer      (every 1 min)        │                   │
│  • rollup:hourly    (every 5 min)        │                   │
│  • rollup:daily     (hourly + EOD)       │                   │
│  • retention/detach (nightly)            │                   │
│  • exports, digests (on demand / cron)   │                   │
└──────────────────────┬───────────────────┼───────────────────┘
                       │                   │
                       ▼                   │
        ┌──────────────────────────┐       │
        │  PostgreSQL              │       │
        │  sessions                │       │
        │  agg_hourly / agg_daily  │       │
        │  accounts, properties…   │       │
        └──────────┬───────────────┘       │
                   │                       │
                   │  read replica         │
                   ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│  API SERVICE                  (FastAPI, K replicas)          │
│  ─────────────────────────────────────────────────────────   │
│  auth · workspaces · properties · goals · segments           │
│  registry-driven report queries · realtime reads · exports   │
└───────────────────────────┬──────────────────────────────────┘
                            │  JSON over HTTPS
                            ▼
              React SPA  (Vite build on CDN/static host)
```

---

## 2.3 The four deployables

| Service | Language/runtime | Scales on | Talks to |
| --- | --- | --- | --- |
| **Collector** | FastAPI + uvicorn | events/sec | Redis (rw), Postgres (write-only, batched) |
| **API** | FastAPI + uvicorn | concurrent dashboard users | Postgres (read replica + primary for writes), Redis (cache) |
| **Worker** | arq | queue depth / schedule | Postgres (rw, primary), Redis |
| **Frontend** | static build | CDN | API only |

> **Decision D-05.** Collector and API are **separate deployables from the same
> Python codebase**, not one service and not two repositories.

**Why separate deployables.** Independent scaling (the collector is CPU-light
and I/O-bound; the API is query-bound), independent failure domains (a runaway
report query cannot starve ingestion), independent deploy cadence (the
collector changes rarely and every deploy risks dropped events), and different
security postures (the collector is unauthenticated and internet-open; the API
is authenticated).

**Why one codebase.** They share the entire domain model, the enrichment logic,
the metric registry, the settings machinery, and the Alembic history. Splitting
the repository would mean either duplicating those or publishing an internal
package — real overhead for no benefit at this size. Part 4 §4.2 shows the
package layout that makes this work: `app/collector/` and `app/api/` are
separate ASGI apps over a shared `app/core/`, `app/models/`, `app/services/`.

Concretely, two entrypoints:

```
uvicorn app.collector.main:app    # collector deployment
uvicorn app.api.main:app          # API deployment
arq app.workers.settings.WorkerSettings   # worker deployment
```

---

## 2.4 Write path in detail

The collector's job is to get the event durable and answer, in that order, as
fast as possible.

**Steps, all in-process, no network round trip to Postgres:**

1. **Parse and validate** the payload against a Pydantic model. Reject
   malformed with 400 — but see §2.5 on the response-code policy.
2. **Resolve tracking id → `property_id`** from an in-process LRU cache
   (refreshed from Postgres every 60s, plus a Redis pub/sub invalidation
   channel). A cache miss falls back to Redis, then Postgres. Properties change
   rarely; this must not be a per-request DB hit.
3. **Bot filter.** UA pattern list plus a known-bot IP range check. Bots are
   ~30–50% of raw traffic on a typical site; dropping them at the edge is the
   single largest cost saving in the system. Part 5 §5.5.
4. **Dedup.** Redis `SET key NX EX 86400` on `event_id`. Part 1 §1.9.
5. **Enrich.** Geo from a memory-mapped MaxMind database (no network call),
   device/browser/OS from UA parsing, channel group from the referrer/UTM rules.
   All CPU-local. Part 5 §5.7–5.9.
6. **Derive `visitor_hash`** from the current daily salt (Redis, cached
   in-process for its lifetime).
7. **Session lookup.** One Redis `GET`/`SET` against
   `prop:{id}:vis:{hash}` to decide continue-or-start. Part 5 §5.10.
8. **Discard IP and raw UA.**
9. **Append to the in-process batch buffer** *and* `XADD` to a Redis Stream.
10. **Return 204.**

**Flush.** A background task in each collector replica flushes the buffer to
Postgres when it reaches 1,000 rows or 500 ms, whichever first, using a single
`COPY` (via `asyncpg.copy_records_to_table`) rather than multi-row `INSERT`.
`COPY` is roughly an order of magnitude faster for bulk loads and produces far
less WAL churn per row.

### The durability question

Buffering in process means an event acknowledged with 204 can be lost if the
replica is killed between buffer-append and flush — up to 500 ms of events per
replica.

Three options were considered:

| Option | Loss window | Collector p99 | Complexity |
| --- | --- | --- | --- |
| **A.** Synchronous `INSERT` per event | zero | 15–40 ms, and couples ingest to DB health | low |
| **B.** In-process buffer + `COPY` | ≤ 500 ms on hard kill | < 5 ms | low |
| **C.** Redis Streams as the durable log; workers consume into Postgres | ≤ Redis loss window | < 5 ms | medium |

> **Decision D-06.** Adopt **B + C together**: the event goes to *both* the
> in-process buffer (which is the primary path into Postgres) and a Redis
> Stream (which serves realtime and acts as a recovery log).

The stream is capped (`MAXLEN ~ 1000000`) and consumed by the realtime indexer.
Because every buffered event is also in the stream, a collector crash is
recoverable: a reconciliation job compares stream entries against
`events_raw` for the affected window and replays the gap. This gets us
option B's latency with something close to option A's durability, at the cost of
writing the reconciliation job (Part 6 §6.8).

Option A is rejected because coupling the write path to Postgres availability
violates the Part 1 §1.3 asymmetry: Postgres failover takes 10–60 seconds, and
we would drop every event in that window.

### Graceful shutdown

Non-negotiable: `SIGTERM` must trigger a buffer flush before exit, and the
deployment's `terminationGracePeriodSeconds` must exceed the flush timeout.
Getting this wrong turns every routine deploy into a data-loss event. Part 10
§10.4.

---

## 2.5 Collector response-code policy

Counter-intuitive but important: **the collector should almost always return
204, even for input it rejects.**

The caller is a tracking script in a stranger's browser. It cannot meaningfully
act on a 400, and a non-2xx response will show up as a console error on the
customer's site — which generates support tickets about *our* script breaking
*their* page. Worse, a 5xx may trigger client retry logic and amplify load
during an incident.

Policy:

| Situation | Response |
| --- | --- |
| Valid event, accepted | `204` |
| Bot detected | `204` (dropped silently) |
| Duplicate | `204` |
| Unknown tracking id | `204` (counted in metrics; do not leak which ids are valid) |
| Malformed payload | `204` (counted and sampled to logs) |
| Rate limited | `429` with `Retry-After` — the one case the client *should* back off |
| Collector genuinely broken | `503` |

Every silent drop increments a labelled Prometheus counter
(`collector_events_dropped_total{reason=...}`). Silence toward the client,
loudness toward operators. Part 10 §10.2.

---

## 2.6 Read path in detail

The API service answers report requests through the registry-driven composer
(Part 1 §1.12, Part 4 §4.9).

**Source routing** — the query planner picks the cheapest table that can answer
the request:

```
Is the range within the realtime window (last 30 min)?
  └─ yes → Redis realtime index
Are all requested dimensions + metrics available in agg_daily,
and is the granularity ≥ 1 day, and is the range fully in closed days?
  └─ yes → agg_daily
Same test against agg_hourly, granularity ≥ 1 hour?
  └─ yes → agg_hourly
Does the request need session-scoped metrics only (bounce, duration, entry)?
  └─ yes → sessions table
Otherwise
  └─ raw events, with an enforced range cap and a statement timeout
```

Mixed ranges (e.g. "last 7 days" where today is still open) are answered by
**union**: closed days from `agg_daily`, today from `agg_hourly` or raw. The
composer handles this seam; it must never be a caller's problem, and it is the
detail most likely to produce off-by-one-day bugs, so it gets dedicated tests
(Part 10 §10.10).

**Caching.** Two layers:

1. **Redis response cache**, keyed by a hash of the fully-resolved query
   (property, range, metrics, dimensions, filters, segment, timezone). TTL is
   range-dependent: closed historical ranges cache for hours, ranges including
   today for 60 seconds.
2. **HTTP `ETag` + `Cache-Control`** so the browser and TanStack Query can
   revalidate cheaply.

Closed historical data is immutable (modulo late arrivals and backfills), so
long TTLs are safe. Cache invalidation on backfill is handled by a per-property
`cache_epoch` counter included in the cache key — bumping it invalidates
everything for that property atomically, which is far simpler and more reliable
than trying to enumerate affected keys.

**Read replica.** Report queries go to a replica; writes (settings, goals,
segments) go to the primary. The API's session factory exposes both, and the
repository layer picks based on an explicit read/write intent rather than by
inference. Part 4 §4.6.

Replica lag matters here: a user who just created a goal must see it
immediately. Rule — **any request in the same session as a mutation reads from
the primary for the next N seconds** (sticky-primary window), or more simply,
all non-report reads use the primary. Report queries tolerate seconds of lag
by nature.

---

## 2.7 Realtime path

Realtime is architecturally separate from historical reporting, and should be.

The realtime indexer (a worker consuming the Redis Stream) maintains, per
property, a small set of Redis structures with 30-minute TTLs:

- A sorted set of `visitor_hash` scored by last-seen timestamp → current
  visitor count is `ZCOUNT` over the window.
- Per-minute counters for pageviews.
- Small `ZINCRBY` leaderboards for top pages, referrers, and countries.

Reads are O(log n) Redis operations, not Postgres queries. This keeps the
realtime view — which users leave open and which polls frequently — entirely
off the database.

**Delivery to the browser.** Start with polling (TanStack Query
`refetchInterval: 10_000`). Do not build WebSockets or SSE for Tier 1.

Rationale: polling a Redis-backed endpoint every 10 seconds costs almost
nothing, works through every proxy and corporate firewall, requires no
connection-state management across API replicas, and reconnects for free.
SSE becomes worth it only when concurrent realtime viewers are high enough that
poll overhead dominates — and at that point it is a contained change behind the
same TanStack Query hook.

---

## 2.8 Why PostgreSQL rather than a columnar store

The obvious objection to this design: ClickHouse (or Druid, or TimescaleDB) is
built for exactly this workload, and 170M rows/day is squarely in its territory.

The counter-argument, and why Postgres wins *here*:

**For Postgres:**
- The brief specifies it. That is a real constraint, not a detail.
- One database for OLTP (accounts, properties, goals) and OLAP means no
  cross-store joins, one backup strategy, one failover story, one connection
  library, one migration tool.
- Declarative partitioning + BRIN indexes + parallel query + the rollup strategy
  in Part 3 is genuinely sufficient at the Part 1 §1.3 targets. The dashboard
  never queries raw events for a long range — it queries rollups, which are
  three to four orders of magnitude smaller.
- Operational familiarity is worth more than benchmark throughput for a small
  team.

**Against Postgres:**
- Row storage means poor compression versus columnar (roughly 5–10× worse).
- Ad-hoc exploration over raw events at 90-day scale will be slow. We handle
  this by *not offering* unconstrained exploration in Tier 1 (Part 1 §1.2) and
  by capping raw-event query ranges.
- Scaling past ~10× the §1.3 targets will require sharding by property or
  moving the event table out.

> **Decision D-07.** PostgreSQL 16+ with declarative partitioning and
> pre-aggregation. **The exit ramp is designed in:** raw events are written
> through a repository interface (Part 4 §4.6) and read only by the rollup
> workers and range-capped queries. Replacing `events_raw` with ClickHouse
> later means reimplementing one repository and the rollup jobs — not touching
> the API, the registry, or the frontend. That containment is the reason this
> decision is safe to make now.

The specific trigger to revisit: sustained ingest above ~20k events/sec, or
`events_raw` exceeding ~5 TB in the hot window, or rollup jobs failing to keep
within their freshness budget after tuning.

### On TimescaleDB

Worth naming since it is the middle path: it is a Postgres extension, so it
keeps the single-database benefit while adding hypertables, native compression
(often 90%+ on event data), and continuous aggregates that would replace much of
Part 6's hand-rolled rollup machinery.

We do not adopt it in the initial build because it constrains hosting (not all
managed Postgres offerings support it), adds an extension-version dimension to
the upgrade path, and its licensing tiers matter for the compression feature.
But it is the **first** thing to evaluate if Part 3's rollup jobs become a
maintenance burden — and because Part 3's schema uses plain declarative
partitioning, migrating to hypertables later is a table-level operation, not a
redesign.

---

## 2.9 Redis's four roles

Redis is load-bearing here, so its uses are enumerated explicitly:

| Role | Structure | Loss impact |
| --- | --- | --- |
| Dedup set | `SET NX EX` per event id | Duplicates slip through to the DB constraint. Tolerable. |
| Session last-seen | `prop:{id}:vis:{hash}`, TTL 30 min | Sessions fragment until the batch sessionizer corrects. Tolerable. |
| Daily salt | Single key per property per day | **Severe** — visitor hashes change mid-day, inflating unique counts. Must be persisted (AOF) or regenerated deterministically. |
| Realtime index | Sorted sets + counters | Realtime view empties, refills within 30 min. Tolerable. |
| Event stream | Redis Stream, capped | Loses the recovery log. Tolerable if the buffer flush succeeded. |
| Response cache | Hashed query keys | Cold cache, slower dashboard. Tolerable. |

Only the **daily salt** is genuinely dangerous to lose. Mitigation: Redis with
AOF persistence, plus the salt is regenerable from a KDF over a
long-lived secret and the date (`HKDF(master_secret, property_id || date)`),
so even total Redis loss reconstructs identical hashes. That single design
touch converts the one severe failure into a tolerable one.

> **Decision D-08.** Derive the daily salt via HKDF from a master secret plus
> the property-local date rather than storing a random value. Same privacy
> properties (the master secret is rotated quarterly and old salts become
> unreconstructable once it is destroyed), but stateless and crash-proof.

---

## 2.10 Data flow summary, end to end

**Happy path for one pageview:**

1. `t+0ms` — Browser executes `tracker.js`, builds the payload, calls
   `navigator.sendBeacon('/api/event', body)`.
2. `t+30ms` — Collector receives it. Validates, resolves property, filters bots,
   dedups, enriches, hashes visitor, resolves session. ~2 ms of work, dominated
   by two Redis round trips.
3. `t+32ms` — Appended to the in-process buffer and `XADD`ed to the stream.
   `204` returned.
4. `t+~100ms` — Realtime indexer consumes the stream entry, bumps sorted sets.
   The event is now visible in the realtime view.
5. `t+≤500ms` — Buffer flushes via `COPY` into `events_raw`. Durable in
   Postgres.
6. `t+≤60s` — Sessionizer worker assigns/updates the `sessions` row, maintaining
   entry page, exit page, pageview count, duration.
7. `t+≤5min` — Hourly rollup worker folds the event into `agg_hourly` for its
   property-local hour.
8. `t+≤1h` — Daily rollup worker folds the hour into `agg_daily`, updating HLL
   sketches.
9. `t+90d` — Retention worker detaches and drops the raw partition. The
   aggregates survive to 25 months.

**Each stage is idempotent and independently replayable.** That property is what
makes the system operable: any worker can be restarted, any window can be
recomputed, and no stage holds state that cannot be rebuilt from the stage
before it. Part 6 §6.3 specifies the idempotency mechanism for each job.

---

## 2.11 Deployment shape

Not prescriptive about the platform, but the shape matters:

| Component | Replicas (initial) | Notes |
| --- | --- | --- |
| Collector | 3, HPA on CPU + request rate | Must have `preStop` flush hook |
| API | 2, HPA on CPU | |
| Worker | 2 | Scheduled jobs must be singleton-guarded (Part 6 §6.9) |
| Postgres primary | 1 | Managed service; PITR enabled |
| Postgres replica | 1 | Report queries |
| Redis | 1 primary + 1 replica | AOF on |
| Frontend | CDN | Static Vite build |

The collector and API should be behind **different** load-balancer routes with
different rate-limit policies and, ideally, different hostnames
(`collect.example.com` vs `api.example.com`). Separate hostnames also let the
collector run with a permissive CORS policy without loosening the authenticated
API's.

---

## 2.12 What Part 3 must resolve

Part 2 has fixed the movement of data. Part 3 must specify the tables it moves
between: the partitioning scheme for `events_raw`, the exact rollup table
design (including which dimension combinations are materialized and which are
not — the combinatorial explosion is the central problem), the HLL approach for
multi-day uniques, the index set, and the retention mechanics.
