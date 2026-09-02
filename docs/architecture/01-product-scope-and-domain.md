# Part 1 — Product Scope and Domain Model

> Depends on: Part 0.
> Feeds: Part 2 (topology), Part 3 (schema), Part 5 (ingestion), Part 7 (UI).

---

## 1.1 The scoping problem

"Google Analytics–like" is not a specification. Real GA4 is a decade of
accreted product surface: attribution modelling, audience builders, BigQuery
export, consent mode, Google Ads integration, predictive metrics, Explorations,
a measurement protocol, and server-side tagging. Attempting all of it produces
a plan nobody can execute.

This part fixes a scope that is (a) genuinely useful on its own, (b) buildable
by a small team, and (c) architecturally *extensible* toward the harder
features rather than blocked by early decisions.

The organizing principle:

> **Build the measurement core correctly, and make the analysis surface
> incremental.**

Getting sessionization, identity, and the aggregation model right is hard to
retrofit — those decisions are baked into stored data. Funnels, cohorts, and
custom explorations are additive query features that can be layered on later
*provided the event model is rich enough*. So we invest disproportionately in
the event model and the storage strategy, and we ship analysis features in
phases.

---

## 1.2 Scope decision: three tiers

### Tier 1 — Core measurement (must ship first)

Everything here is either data-model-defining or table-stakes for the product
to be usable at all.

| Capability | Notes |
| --- | --- |
| JS tracking snippet | Pageviews, SPA route changes, custom events, outbound link clicks |
| Event collection API | High-throughput write endpoint, no auth, CORS-open, bot-filtered |
| Sessionization | 30-minute inactivity window, midnight boundary, campaign-change boundary |
| Visitor identification | Cookieless daily-rotating hash (see §1.7) |
| Core metrics | Pageviews, sessions, unique visitors, bounce rate, session duration, views/session |
| Core dimensions | Page path, referrer, UTM set, country, region, device type, browser, OS |
| Time-series dashboard | Metric over time with adjustable granularity |
| Breakdown tables | Top pages, referrers, sources, countries, devices, browsers |
| Date range + comparison | Presets, custom range, previous-period and previous-year comparison |
| Realtime view | Visitors in the last 30 minutes |
| Multi-property | One account manages several websites |
| Auth + workspaces | Registration, login, invite teammates, role-based access |

### Tier 2 — Analysis depth (next)

| Capability | Notes |
| --- | --- |
| Custom events + properties | User-defined events with a typed property bag |
| Goals / conversions | Mark an event or a URL pattern as a conversion; conversion rate by source |
| Funnels | Ordered step sequences with drop-off, over a session or a user window |
| Segments | Save a filter set and apply it across every report |
| Entry / exit pages | Requires session-scoped first/last page — see §1.6 |
| Landing page reports | Conversion rate and bounce by entry page |
| Scroll depth + engagement time | Requires client-side timing signals |
| CSV / JSON export | Per report |
| Email digests | Scheduled weekly/monthly summary |

### Tier 3 — Advanced (explicitly deferred, but not designed out)

| Capability | Why deferred | What keeps it possible |
| --- | --- | --- |
| Retention / cohort analysis | Needs stable long-lived identity | Optional authenticated `user_id` in the event model from day one (§1.7) |
| Multi-touch attribution | Needs cross-session journey stitching | Session table retains first-touch and last-touch campaign columns |
| Path / flow exploration | Query cost is high | Raw events retained at full fidelity for the hot window (Part 3 §3.9) |
| A/B test integration | Product surface, not measurement | Experiment id/variant reserved in the event property bag |
| Server-side ingestion API | Separate auth model | Collector is designed with a pluggable auth strategy (Part 5 §5.4) |
| Anomaly detection | Needs a baseline history | Rollup tables give cheap historical series (Part 3 §3.6) |

**The rule for Tier 3:** we do not build it, but no Tier 1 decision may make it
impossible. Each row above names the specific hedge.

### Explicitly out of scope

Ad-network integrations, tag management, consent-mode signal modelling,
predictive audiences, cross-device graph, and BigQuery-style raw export. These
are named so that nobody later assumes they were implied.

---

## 1.3 Non-functional targets

These numbers drive Part 3's partitioning strategy and Part 10's capacity plan.
They are the design target for the first production year, not a hard ceiling.

| Dimension | Target |
| --- | --- |
| Sustained ingest | 2,000 events/sec |
| Peak ingest (burst, 5 min) | 10,000 events/sec |
| Events per day at sustained rate | ~170 M |
| Collector p99 latency | < 50 ms (it does almost nothing synchronously — Part 5 §5.6) |
| Collector availability | 99.9% — a dropped event is unrecoverable, unlike a failed dashboard load |
| Dashboard query p95 | < 500 ms for any Tier-1 report over a 90-day range |
| Dashboard query p99 | < 2 s |
| Realtime lag | < 10 s from event to realtime view |
| Aggregate freshness | < 5 min for today's rollups |
| Raw event retention | 90 days (configurable per plan) |
| Aggregate retention | 25 months (supports year-over-year with a month of slack) |

Two of these deserve comment.

**Collector availability is a higher bar than dashboard availability.** If the
dashboard is down for ten minutes, users are annoyed. If the collector is down
for ten minutes, the data is *gone forever* — there is no retry from a browser
that has navigated away. This asymmetry justifies the architectural separation
in Part 2 §2.4: the collector is a separate deployable with a separate scaling
policy and no dependency on the query path.

**25 months of aggregate retention, not 24.** Year-over-year comparison on
2026-12-31 needs 2025-12-31. A flat 24-month window makes that comparison fail
at exactly the moment (year end) when people most want it.

---

## 1.4 The domain model

Nine core entities. Everything in Part 3's schema derives from this.

```
Account (a person who logs in)
   └─ belongs to many ─┐
                       ├── Workspace (billing + team boundary)
   Membership ─────────┘        │
   (role: owner/admin/           │ owns many
    analyst/viewer)              ▼
                              Property (one website / one data stream)
                                 │
                                 ├── owns many ── Goal
                                 ├── owns many ── Segment (saved filter)
                                 ├── owns many ── ApiKey
                                 │
                                 └── receives ──▶ Event (raw, partitioned)
                                                    │
                                                    └─ grouped into ─▶ Session
                                                                        │
                                                    Visitor ◀───────────┘
                                                  (ephemeral identity)
```

### Entity definitions

**Account.** An authenticated human. Email, password hash, name, verification
state, MFA settings. Deliberately *not* the tenancy boundary — one person may
work across several client workspaces, and modelling the account as the tenant
makes agency use cases impossible to retrofit.

**Workspace.** The tenancy and billing boundary. Owns properties, holds the
plan/quota, and is the scope for team membership. Every analytics query is
authorized against a workspace. Deleting a workspace cascades to all its data.

**Membership.** The join between Account and Workspace, carrying a role. See
Part 8 §8.6 for the permission matrix.

**Property.** A single measured website or app — one tracking id, one data
stream. Holds timezone (critical: all day-bucketing is in property-local time,
see §1.8), currency, excluded IPs, excluded paths, bot-filter settings, and the
data retention override.

**Event.** The atomic fact. Immutable, append-only, partitioned by time. This
is the highest-volume table in the system by three orders of magnitude and its
design dominates Part 3.

**Session.** A bounded sequence of events from one visitor. Derived, not
collected — the client never sends a session id (see §1.6 for why). Materialized
by a background worker so that session-scoped metrics don't require a window
function over raw events at query time.

**Visitor.** Deliberately *not* a stored entity with a lifecycle. It is a hash
value that appears on events (§1.7). There is no `visitors` table. This is a
significant decision and §1.7 defends it.

**Goal.** A named conversion definition owned by a property: either an event
name match or a URL pattern match, optionally with a value.

**Segment.** A saved, named filter expression, applicable across reports.

---

## 1.5 The event model

Every event carries a common envelope plus type-specific properties.

### Envelope (present on every event)

| Field | Type | Source | Notes |
| --- | --- | --- | --- |
| `event_id` | UUID v7 | server | Time-ordered; doubles as the dedup key (§1.9) |
| `property_id` | bigint | client (tracking id → resolved) | Tenancy key, on every index |
| `occurred_at` | timestamptz | client, clamped | When it happened in the browser |
| `received_at` | timestamptz | server | When we got it; the partition key (§1.10) |
| `event_name` | text | client | `pageview`, `session_start`, or custom |
| `visitor_hash` | bytea(16) | server, derived | §1.7 |
| `session_id` | uuid | server, derived | Assigned by sessionization, null until then |
| `user_id` | text, nullable | client | Set only if the site identifies logged-in users |

### Page context

`page_url`, `page_path`, `page_query`, `page_hostname`, `page_title`,
`referrer_url`, `referrer_domain`.

**Store `page_path` separately from `page_url`.** Nearly every report groups by
path, and reparsing a URL at query time across 170M rows/day is not viable.
Normalize once at ingest.

### Campaign context

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, plus a
derived `channel_group` (Direct / Organic Search / Paid Search / Social /
Referral / Email / Affiliate / Display / Other).

**`channel_group` is computed at ingest, not at query time.** The classification
rules are non-trivial (they involve a referrer-domain lookup table plus UTM
precedence rules), and computing them per-query would both be slow and make
historical numbers change retroactively whenever the rules were edited. Storing
the resolved value means history is stable and reclassification is an explicit,
auditable backfill. See Part 5 §5.9.

### Device context

`device_type` (desktop/mobile/tablet/bot), `browser_name`, `browser_version`,
`os_name`, `os_version`, `screen_width`, `screen_height`, `viewport_width`,
`viewport_height`.

All derived server-side from the User-Agent (and Client Hints where available).
See Part 5 §5.8 — and note that the raw User-Agent string is deliberately
**not** retained past enrichment, for the fingerprinting-surface reason in
§1.7.

### Geo context

`country_code`, `region`, `city`, `timezone`. Derived from IP via a local
MaxMind-style database at ingest. **The IP address is never stored** — it is
used for geo lookup and for the visitor hash, then discarded within the request.
See Part 5 §5.7 and Part 10 §10.8.

### Custom properties

`properties` — a `jsonb` column for user-defined key/values on custom events.

This is the one place we accept schemaless storage, and it is a considered
tradeoff:

- **For it:** custom events are user-defined by nature; a rigid schema would
  require a migration per customer event type, which is untenable.
- **Against it:** `jsonb` is larger on disk than typed columns, and GIN indexes
  on it are expensive to maintain at 170M rows/day.
- **Mitigation:** we do *not* GIN-index `properties` on the raw event table.
  Filtering on custom properties is supported only through Tier-2 pre-declared
  "registered properties," which get promoted into dedicated rollup dimensions.
  Ad-hoc `jsonb` filtering is restricted to the realtime window and to
  explicitly slow, rate-limited exploration queries. Part 3 §3.11 details this.

### What is deliberately absent

No raw IP. No raw User-Agent after enrichment. No client-supplied session id.
No cross-site identifier. No stored fingerprint beyond the daily-rotating hash.
Each omission is a privacy decision with an architectural consequence, and they
are collected in Part 10 §10.8.

---

## 1.6 Sessionization

A session is a sequence of events from one visitor with no gap longer than the
inactivity timeout.

### The rules

A new session starts when any of these is true:

1. **No prior event** from this `visitor_hash` on this property.
2. **Inactivity gap ≥ 30 minutes** since the visitor's previous event.
3. **Property-local midnight** has been crossed. (Keeps "sessions today" a
   well-defined, non-overlapping count. Costs a small amount of realism for a
   large amount of reporting sanity.)
4. **Campaign change** — a new non-direct `utm_source`/`utm_medium` arrives
   mid-session. Standard attribution practice: if someone returns via a
   different paid ad, that is a new visit for attribution purposes.

### Why the server derives sessions

The client could hold a session id in `sessionStorage` and send it. We do not do
that, for four reasons:

1. **`sessionStorage` is per-tab.** Two tabs = two sessions, which is wrong.
2. **It is trivially spoofable**, and it is a write-path input we would have to
   validate anyway.
3. **The rules change.** Timeout length, midnight handling, and campaign-break
   behaviour are all things a product will tune. Server-derived sessions can be
   *recomputed* from raw events; client-supplied ones are frozen forever.
4. **It is another cookie/storage surface** in a product whose privacy position
   (§1.7) is that it needs neither.

Point 3 is the decisive one. Because sessionization is a pure function of the
raw event stream, changing the timeout from 30 to 20 minutes is a backfill job,
not a data loss event.

### The cost, honestly

Server-side sessionization means the collector cannot assign `session_id` at
write time without a lookup of "this visitor's last event time," which is a
read on the hot write path. Part 5 §5.10 resolves this with a Redis
last-seen cache (key `prop:{id}:vis:{hash}`, TTL 30 min, single `SET`/`GET`
round trip), falling back to the batch sessionizer when the cache misses. The
batch job in Part 6 §6.4 is the source of truth and corrects any drift.

---

## 1.7 Visitor identity — the cookieless daily hash

### The scheme

```
visitor_hash = BLAKE2b-128(
    daily_rotating_salt || property_id || client_ip || user_agent
)
```

- `daily_rotating_salt` is a cryptographically random 32-byte value regenerated
  every 24 hours at property-local midnight, held in Redis and never persisted
  to disk.
- The previous day's salt is retained for a short grace window to handle
  midnight-boundary sessionization, then destroyed.
- The IP and UA are hashed within the request and never written anywhere.

### What this buys

**No cookies, no `localStorage`, no consent banner in most jurisdictions.** The
hash is not reversible to an individual, does not persist beyond 24 hours, and
cannot be joined across properties (because `property_id` is in the digest) or
across days (because the salt rotates and the old salt is destroyed). This is
the Plausible/Fathom model and it has held up under GDPR scrutiny.

### What this costs — stated plainly

1. **"Unique visitors" is really "unique visitors per day."** Counting uniques
   across a 30-day range is not a `COUNT(DISTINCT visitor_hash)` — the same
   person has 30 different hashes. Multi-day unique counts must use a
   probabilistic sketch (HyperLogLog) maintained per day and merged, which
   gives ~2% error. Part 3 §3.7 specifies the HLL columns; **this constraint
   must also surface in the UI**, where multi-day unique-visitor figures should
   be labelled as estimates (Part 7 §7.12).
2. **No true returning-visitor metric.** "New vs. returning" cannot be computed
   from a daily-rotating hash. We either omit it (recommended for Tier 1) or
   offer it only for properties that opt into `user_id` identification.
3. **No cross-session retention or cohorts.** This is why Tier 3 retention is
   deferred, and why the optional `user_id` field exists as the escape hatch.
4. **Shared-IP collision.** Two people on the same office NAT with the same
   browser version hash identically. This inflates session counts downward
   slightly. Accepted; the alternative is fingerprinting.

### The escape hatch

`user_id` is nullable and client-supplied. A site that already authenticates its
users can pass a stable pseudonymous id, and for those properties we can offer
real retention, cohorts, and cross-device stitching — with the consent
obligations that implies. This is opt-in per property, and it is the single
hedge that keeps all of Tier 3 reachable.

> **Decision D-01.** Cookieless daily-rotating hash as the default identity;
> optional `user_id` as an opt-in upgrade. Rationale: privacy-by-default is a
> product differentiator and removes an entire compliance workstream, and the
> `user_id` hatch means we are not architecturally trapped.

---

## 1.8 Time and timezones

This is the most under-appreciated source of bugs in analytics systems.

### Rules

1. **Store everything in UTC.** `timestamptz` throughout. No local-time storage,
   ever.
2. **Bucket in property-local time.** "Today," "yesterday," "last 7 days," and
   every daily rollup are computed in the property's configured timezone. A
   Tokyo site's "today" is not a London site's "today."
3. **The property timezone is immutable after data exists.** Changing it would
   silently reshuffle every historical daily bucket. If a user must change it,
   that is an explicit, confirmed, full-rebuild operation — not a settings
   toggle. Part 3 §3.8.
4. **`occurred_at` is clamped.** Client clocks are wrong, sometimes by years. If
   `|occurred_at − received_at| > 24h`, we clamp `occurred_at` to `received_at`
   and set a `clock_skew` flag. Unclamped client timestamps will otherwise
   write rows into partitions from 1970 and 2049.
5. **Rollups key on property-local date**, stored as a plain `date` column
   computed at rollup time via `(occurred_at AT TIME ZONE property.timezone)::date`.
6. **DST is handled by the database, not by us.** Use IANA zone names
   (`Europe/London`), never fixed offsets. Postgres's `AT TIME ZONE` with a
   named zone is DST-correct; `+01:00` is not.

---

## 1.9 Deduplication

Events arrive more than once. Causes: `navigator.sendBeacon` retries, client
retry-on-network-error, page restored from bfcache, and at-least-once delivery
in the ingestion queue (Part 2 §2.6).

**Mechanism.** The client generates a UUID v7 per event and sends it as
`event_id`. The collector maintains a Redis set of recently seen ids
(24-hour TTL) and drops duplicates. The database additionally enforces a unique
constraint on `(property_id, event_id)` per partition as a backstop.

**Why UUID v7 specifically.** It is time-ordered, so it (a) gives good index
locality on a B-tree, unlike v4 which scatters writes across the whole index,
and (b) carries an embedded timestamp usable as a sanity check against
`occurred_at`.

**Why both Redis and a DB constraint.** Redis handles the common case cheaply
and keeps duplicates off the write path entirely. The DB constraint catches the
case where Redis has been flushed or a duplicate arrives after the TTL. Belt
and braces, because a double-counted conversion is a credibility-destroying bug.

---

## 1.10 Partition key: `received_at`, not `occurred_at`

A genuinely consequential choice, and the non-obvious one is correct.

`occurred_at` is what users think in. But partitioning on it means a late
arrival — a mobile client that was offline for three days, a beacon flushed on
reopen — writes into an old partition. That defeats the main operational
benefit of time partitioning: **old partitions should become immutable, so they
can be compressed, moved to cheap storage, vacuum-frozen, and detached
wholesale.**

Partitioning on `received_at` guarantees writes only ever touch the newest
partition. Late data lands in today's partition with an old `occurred_at`, which
the rollup jobs handle by re-aggregating an affected-days set (Part 6 §6.6)
rather than by rewriting history in place.

> **Decision D-02.** Partition raw events by `received_at`. Report on
> `occurred_at`. Accept that a query for "last Tuesday" scans a small number of
> adjacent partitions rather than exactly one — the query planner prunes on a
> `received_at BETWEEN` predicate that the query layer adds automatically with
> a configurable slack window (default 3 days).

---

## 1.11 Metric definitions

These must be written down and agreed before any SQL is written. Ambiguity here
is the most common cause of "the numbers don't match" escalations.

| Metric | Definition | Computed as |
| --- | --- | --- |
| **Pageviews** | Count of `pageview` events | `COUNT(*) WHERE event_name='pageview'` |
| **Sessions** | Count of distinct sessions | `COUNT(DISTINCT session_id)`, or `COUNT(*)` on the sessions table |
| **Unique visitors (1 day)** | Distinct visitor hashes that day | `COUNT(DISTINCT visitor_hash)` — exact |
| **Unique visitors (multi-day)** | Estimated distinct people | HLL merge across daily sketches — **approximate, ±2%** |
| **Bounce rate** | Sessions with exactly one pageview ÷ sessions | Computed on the sessions table from `pageview_count = 1` |
| **Session duration** | `last_event_at − started_at` | Zero for single-event sessions (see note) |
| **Avg session duration** | Mean over sessions | Include or exclude bounces — **must be stated in the UI** |
| **Views per session** | Pageviews ÷ sessions | |
| **Entry page** | `page_path` of the session's first pageview | Denormalized onto the session row |
| **Exit page** | `page_path` of the session's last pageview | Denormalized onto the session row |
| **Conversion rate** | Sessions with ≥1 goal completion ÷ sessions | Per goal, per segment |
| **Engagement time** | Sum of client-reported active time | Tier 2; requires visibility-API instrumentation |

**The session-duration caveat.** A bounced session has one event, so its
duration is zero by this definition — even if the visitor read the page for four
minutes. This makes "average session duration" systematically understated, and
it is why GA4 replaced it with engagement time. We ship the honest zero-based
number in Tier 1, label it clearly, and add engagement time in Tier 2 as the
better metric. What we must *not* do is quietly exclude bounces to make the
number look better, because then the metric no longer reconciles against
sessions.

> **Decision D-03.** Every metric in the UI carries a definition tooltip
> sourced from a single shared registry (Part 7 §7.9 specifies the frontend
> side; the same registry drives the backend's metric resolver in Part 4 §4.9).
> One definition, two consumers, no drift.

---

## 1.12 The metric/dimension registry

Rather than hand-writing a query per report, Tier 1 introduces a **registry**: a
declarative table of metrics and dimensions from which the query layer composes
SQL.

**Why.** The Tier-1 report set is roughly {8 metrics} × {12 dimensions} ×
{filters} × {time granularities}. Hand-writing that is hundreds of near-identical
query functions. A registry collapses it to one composer plus ~20 declarations,
and it is the same structure that later makes Tier-2 segments and Tier-3
explorations tractable.

**Shape.** Each metric declares its SQL aggregate expression, which source table
it can be served from (raw events / sessions / which rollup), its formatting
type, and whether it is additive across time buckets. Each dimension declares
its column, its source tables, its cardinality class, and its display label.

**The critical field is "which source table."** It is what lets the query
planner in Part 4 §4.9 automatically route a request to the cheapest table that
can answer it — the daily rollup if the range is long and the dimensions are
pre-aggregated, raw events only when it must. This routing logic is the single
biggest determinant of whether the dashboard hits its 500 ms p95 budget, and it
is only possible because the registry makes source capability declarative.

> **Decision D-04.** Registry-driven query composition from day one, not
> hand-written report queries. Rationale: the alternative does not scale past
> Tier 1, and retrofitting a registry after hand-written queries exist means
> rewriting every report and re-validating every number.

---

## 1.13 What Part 2 must resolve

Part 1 has fixed *what* we measure. Part 2 must decide *how the data moves*:
whether the collector writes synchronously to Postgres or through a queue,
where sessionization runs, how rollups are triggered, and how the realtime path
diverges from the historical path. The non-functional targets in §1.3 —
particularly 10k events/sec peak against a < 50 ms collector p99 — are the
binding constraints on that decision.
