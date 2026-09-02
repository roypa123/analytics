# Part 4 — Backend Architecture

> Depends on: Part 2 (four deployables, D-05), Part 3 (schema, D-10 rollups).
> Feeds: Part 5, 6, 8, 9.

---

## 4.1 The layering question, answered honestly

The brief asks for a layered architecture with **Models, Views, Controllers,
Services, Repositories, Schemas** and specifies the flow:

```
Request → Router/View → Controller → Service → Repository/Data Access → Model/DB
```

That is the classic enterprise layering, and most of it is right for this
system. But one element deserves scrutiny rather than compliance: **the
Controller layer.**

In Django or Rails, the controller exists because the framework's view function
is a thin HTTP handler with no validation, no dependency injection, and no
serialization. Something has to sit between the URL and the domain logic.

FastAPI's router function **already is that layer**. It performs request
parsing, Pydantic validation, dependency injection, auth resolution, response
serialization, and status-code selection — declaratively, through the
signature. Inserting a separate `controllers/` package between the router and
the service typically produces this:

```python
# routers/reports.py
async def get_report(req: ReportRequest, ctx = Depends(...)):
    return await report_controller.get_report(req, ctx)   # ← adds nothing

# controllers/report_controller.py
async def get_report(req, ctx):
    return await report_service.get_report(req, ctx)      # ← adds nothing
```

Two files of pass-through per endpoint. It is the single most common source of
bloat in FastAPI projects that adopt enterprise layering by rote.

> **Decision D-11.** **Merge the Controller responsibility into the Router
> layer.** The router *is* the controller. It owns HTTP concerns; it must not
> own business logic. The five real layers are:
>
> **Router (view/controller) → Service → Repository → Model → Database**
>
> with **Schemas** as a cross-cutting contract layer, not a pipeline stage.

This satisfies every responsibility the brief assigns to the controller — HTTP
handling, validation, response formatting — while eliminating a layer that
would only ever forward calls.

**The discipline that makes this safe** (and it is the thing that goes wrong
when people merge these layers): a router function must contain **no `if`
statement that expresses a business rule, and no direct database access.** Its
body should be, in nearly every case, one call into a service plus a response
construction. If a router body grows past ~10 lines or acquires branching, the
logic belongs in a service. This is enforced in review, and §4.13 gives a
checklist.

**When a real controller layer would be justified:** if we later needed to serve
the same operations over multiple protocols (REST + GraphQL + gRPC), a
protocol-agnostic controller would earn its place. We serve one protocol. We
are not building for that.

---

## 4.2 Package layout

Grounded in Part 2 §2.3: two ASGI apps and a worker over one shared core.

```
analytics-backend/
├── pyproject.toml                 ← replaces requirements.txt (§4.4)
├── alembic.ini
├── .env.example
├── Dockerfile
├── migrations/                    ← Alembic; see Part 9
│   ├── env.py
│   └── versions/
├── app/
│   │
│   ├── core/                      ← cross-cutting, no domain knowledge
│   │   ├── config.py              ← Settings (pydantic-settings)
│   │   ├── database.py            ← engines, session factories, UoW
│   │   ├── redis.py               ← Redis client factory
│   │   ├── security.py            ← hashing, JWT encode/decode
│   │   ├── exceptions.py          ← the AppError hierarchy (§4.11)
│   │   ├── logging.py             ← structlog setup
│   │   ├── pagination.py
│   │   └── types.py               ← shared aliases, PropertyId, etc.
│   │
│   ├── models/                    ← SQLAlchemy ORM — persistence shape only
│   │   ├── base.py                ← DeclarativeBase, naming convention, mixins
│   │   ├── core/                  ← core.* schema
│   │   │   ├── account.py  workspace.py  membership.py
│   │   │   ├── property.py  goal.py  segment.py  api_key.py
│   │   └── analytics/             ← analytics.* schema
│   │       ├── event.py  session.py  aggregate.py  dimension.py
│   │
│   ├── schemas/                   ← Pydantic — the wire contract
│   │   ├── common.py              ← Page[T], ErrorResponse, DateRange
│   │   ├── auth.py  account.py  workspace.py  property.py
│   │   ├── goal.py  segment.py
│   │   ├── event.py               ← the collector's input model
│   │   └── report.py              ← ReportRequest / ReportResponse
│   │
│   ├── repositories/              ← all SQL lives here, and only here
│   │   ├── base.py                ← generic CRUD over a model
│   │   ├── account_repo.py  workspace_repo.py  property_repo.py
│   │   ├── goal_repo.py  segment_repo.py
│   │   ├── event_repo.py          ← COPY bulk insert, raw scans
│   │   ├── session_repo.py
│   │   └── aggregate_repo.py      ← executes composed report SQL
│   │
│   ├── services/                  ← business logic, orchestration
│   │   ├── auth_service.py  account_service.py  workspace_service.py
│   │   ├── property_service.py  goal_service.py  segment_service.py
│   │   ├── ingestion_service.py   ← validate→filter→enrich→buffer
│   │   ├── report_service.py      ← registry + planner + execution
│   │   ├── realtime_service.py
│   │   └── export_service.py
│   │
│   ├── analytics/                 ← the domain engine (§4.9)
│   │   ├── registry/
│   │   │   ├── metrics.py         ← metric declarations
│   │   │   ├── dimensions.py      ← dimension declarations
│   │   │   └── sources.py         ← which table serves what
│   │   ├── planner.py             ← request → chosen source + plan
│   │   ├── compiler.py            ← plan → SQLAlchemy Core select()
│   │   ├── filters.py             ← filter AST → WHERE clause
│   │   └── timeranges.py          ← presets, comparison periods, tz math
│   │
│   ├── enrichment/                ← pure, testable, no I/O beyond mmap
│   │   ├── geo.py                 ← MaxMind lookup
│   │   ├── useragent.py           ← device/browser/OS parsing
│   │   ├── channels.py            ← channel_group classification
│   │   ├── bots.py                ← bot detection
│   │   └── urls.py                ← path/query normalization
│   │
│   ├── api/                       ← DEPLOYABLE 1 — authenticated API
│   │   ├── main.py                ← FastAPI app, middleware, lifespan
│   │   ├── deps.py                ← Depends() providers
│   │   ├── middleware/
│   │   │   ├── request_id.py  logging.py  error_handler.py
│   │   │   ├── cors.py  ratelimit.py
│   │   └── v1/
│   │       ├── router.py          ← aggregates the sub-routers
│   │       ├── auth.py  accounts.py  workspaces.py  properties.py
│   │       ├── goals.py  segments.py
│   │       ├── reports.py  realtime.py  exports.py
│   │
│   ├── collector/                 ← DEPLOYABLE 2 — public ingest
│   │   ├── main.py                ← minimal app: no auth, no ORM on hot path
│   │   ├── deps.py
│   │   ├── buffer.py              ← in-process batch buffer + flusher
│   │   └── routes.py              ← POST /event, GET /event (pixel fallback)
│   │
│   ├── workers/                   ← DEPLOYABLE 3
│   │   ├── settings.py            ← arq WorkerSettings, cron schedule
│   │   ├── sessionizer.py
│   │   ├── rollup_hourly.py  rollup_daily.py
│   │   ├── realtime_indexer.py
│   │   ├── retention.py  partitions.py
│   │   ├── reconcile.py           ← Part 2 §2.4 stream-vs-table gap fill
│   │   └── exports.py  digests.py
│   │
│   └── utils/                     ← pure helpers, no app imports
│       ├── hashing.py  ids.py  timeparse.py
│
└── tests/
    ├── unit/  integration/  migration/  load/
```

### Why `analytics/` and `enrichment/` are top-level, not inside `services/`

Both are **domain engines**: substantial bodies of pure logic with their own
internal structure, consumed by services but not themselves orchestration.

`enrichment/` is imported by the collector's ingestion service *and* by
backfill workers. `analytics/` is imported by the report service, the export
service, and the rollup workers. Burying either inside `services/` would
misrepresent them as a single service's implementation detail and would invite
circular imports the moment a second consumer appeared.

The test for "does this deserve to be top-level": it has more than one consumer,
it has no I/O of its own, and it is where the hard domain thinking lives. Both
qualify. Nothing else does.

---

## 4.3 Dependencies

Addressing Part 0 F-07. Every package justified.

```toml
[project]
requires-python = ">=3.12"
dependencies = [
  # web
  "fastapi>=0.141",
  "uvicorn[standard]>=0.52",
  "pydantic>=2.13",
  "pydantic-settings>=2.7",       # F-07: typed config, replaces bare dotenv

  # database
  "sqlalchemy[asyncio]>=2.0.36",
  "alembic>=1.14",
  "asyncpg>=0.30",                # async driver — API + collector
  "psycopg[binary]>=3.2",         # sync driver — Alembic + some worker paths

  # cache / queue
  "redis[hiredis]>=5.2",
  "arq>=0.26",                    # task queue — see §4.5

  # security
  "argon2-cffi>=23.1",            # password hashing — see §4.8
  "pyjwt[crypto]>=2.10",

  # enrichment
  "maxminddb>=2.6",               # local geo db, no network call
  "ua-parser>=1.0",

  # observability
  "structlog>=24.4",
  "prometheus-client>=0.21",
  "opentelemetry-instrumentation-fastapi>=0.50b0",
]

[dependency-groups]
dev = [
  "pytest>=8.3", "pytest-asyncio>=0.25", "pytest-cov",
  "httpx>=0.28",                  # async test client
  "testcontainers[postgres]>=4.9", # real Postgres in tests — see Part 9 §9.10
  "polyfactory>=2.18",            # schema-driven test fixtures
  "ruff>=0.8", "mypy>=1.14",
  "locust>=2.32",                 # load testing the collector
]
```

**Both asyncpg and psycopg.** Not redundant. Alembic's migration environment is
synchronous by nature (and running it async adds complexity for no gain), and
some worker operations — notably `COPY`-based bulk loads and long-running
maintenance DDL — are simpler and more reliable synchronously. asyncpg serves
the request-path async engines. Two drivers, two clearly-scoped roles.

---

## 4.4 `pyproject.toml` over `requirements.txt`

> **Decision D-12.** Replace `requirements.txt` with `pyproject.toml` +
> `uv.lock`, managed by `uv`.

**Why.** It resolves Part 0 F-08 (the UTF-16 problem) by deleting the file
entirely. It separates direct dependencies from the transitive closure — the
current `requirements.txt` lists `h11`, `idna`, and `typing_extensions`, which
nobody chose and nobody should be manually bumping. It gives a real lockfile
with hashes for reproducible builds. It supports dependency groups so dev tools
don't ship in the production image. And `uv` resolves and installs roughly an
order of magnitude faster than pip, which matters most in CI where it runs on
every push.

**Cost.** One more tool. Some hosting platforms auto-detect `requirements.txt`
and would need explicit build configuration. Mitigation: `uv export --format
requirements-txt > requirements.txt` in CI generates a compatible file for such
platforms, without it being the source of truth.

---

## 4.5 Task queue: arq over Celery

> **Decision D-13.** `arq` for background processing.

| | arq | Celery |
| --- | --- | --- |
| Async native | Yes — coroutine tasks, shares the app's async DB session pattern | Bolted on; async support is awkward |
| Broker | Redis only (which we already run) | Many, incl. RabbitMQ |
| Cron | Built in | Needs Celery Beat, a separate process |
| Codebase size | Small enough to read in an afternoon | Large; deep configuration surface |
| Ecosystem | Modest | Extensive |
| Failure modes | Few, obvious | Many, well-documented, still surprising |

The decisive factor is **async-native**. Our workers are I/O-bound
(Postgres + Redis) and the rollup jobs benefit directly from concurrent
per-property processing. With Celery we would either run sync workers (losing
that) or fight the async bridge. arq also removes the separate Beat process,
which is one fewer singleton to manage.

**What we give up:** Celery's ecosystem (Flower, extensive routing, result
backends). We do not need routing, and Part 10 §10.2 gives worker observability
through Prometheus metrics rather than a UI.

**Revisit if:** we need multi-broker fanout, or task volume/complexity outgrows
arq's simple model.

---

## 4.6 The Repository layer

**Rule R-01: All SQL lives in `repositories/`. No exceptions.** No service, no
router, no worker constructs or executes a query directly.

### What this buys

1. **The Part 2 §2.8 exit ramp.** Moving `events_raw` to ClickHouse means
   rewriting `event_repo.py` and `aggregate_repo.py`. Nothing else. That
   containment is only real if the rule is absolute.
2. **Testability.** Services are tested against repository fakes; repositories
   are tested against a real Postgres (Part 9 §9.10). Two clean test tiers
   instead of one muddy one.
3. **Query auditability.** Every query the system can issue is in one directory.
   When the dashboard is slow, there is one place to look.
4. **Read/write routing.** The repository decides primary vs. replica
   (Part 2 §2.6), because it is the only layer that knows whether an operation
   is a read.

### Interface shape

Repositories take a session, return **domain objects or plain data structures —
never SQLAlchemy `Result` objects or raw `Row` tuples.** Leaking a `Row` past
the repository boundary leaks the query shape into the service, which defeats
the point.

```python
class AggregateRepository:
    def __init__(self, session: AsyncSession) -> None: ...

    async def execute_report(self, plan: QueryPlan) -> ReportRows: ...
    async def upsert_daily_totals(self, rows: Sequence[DailyTotalRow]) -> None: ...
    async def affected_dates(self, prop: PropertyId, since: datetime) -> list[date]: ...
```

### SQLAlchemy Core, not ORM, for analytics

The ORM is right for `core.*`: identity map, relationships, unit of work,
change tracking — all useful for accounts and settings.

It is wrong for `analytics.*`. Report queries are dynamically composed
aggregates that map to no entity, ORM object hydration over aggregate rows is
pure overhead, and bulk insert of a million events through ORM objects would be
absurd.

> **Decision D-14.** ORM for `core.*`, SQLAlchemy Core `select()` for
> `analytics.*` reads, and `asyncpg.copy_records_to_table` for event bulk
> inserts. All three still live behind repositories, so callers cannot tell.

**Core `select()`, not raw SQL strings**, for the composed queries. The
compiler in §4.9 builds query objects programmatically; doing that with string
concatenation is how SQL injection happens, and Core gives parameter binding
and dialect handling for free.

---

## 4.7 Configuration

Replacing bare `os.environ` (Part 0 F-07):

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_nested_delimiter="__")

    environment: Literal["local", "test", "staging", "production"]
    database: DatabaseSettings
    redis: RedisSettings
    security: SecuritySettings
    ingestion: IngestionSettings     # buffer size, flush ms, rate limits
    analytics: AnalyticsSettings     # session timeout, retention, range caps
    observability: ObservabilitySettings
```

Principles:

- **Typed and validated at startup.** A malformed `SESSION_TIMEOUT_MINUTES`
  should crash the process on boot, not throw a `ValueError` at 3am inside a
  rollup job.
- **Nested by concern**, so `INGESTION__FLUSH_INTERVAL_MS` is unambiguous.
- **No defaults for secrets.** `SECURITY__JWT_PRIVATE_KEY` has no default;
  omitting it is a startup failure. A default secret that reaches production is
  a breach.
- **Environment-conditional validation.** A validator asserts that in
  `production`, debug is off, CORS is not `*` on the API, and the DSN is not
  localhost.
- **One instance**, `@lru_cache`d, injected via `Depends(get_settings)` so
  tests can override it.

---

## 4.8 Password hashing: Argon2id

> **Decision D-15.** `argon2-cffi` with Argon2id, not bcrypt.

Argon2id won the Password Hashing Competition and is the current OWASP
first-choice recommendation. It is memory-hard, so GPU/ASIC attacks are far more
expensive than against bcrypt. Bcrypt additionally has the 72-byte truncation
gotcha, which silently ignores anything past 72 bytes of a passphrase.

Parameters (OWASP baseline, to be re-benchmarked on production hardware):
`m=19456 KiB, t=2, p=1`. Target ~50–100 ms per hash on the API instance —
slow enough to matter to an attacker, fast enough not to be a login DoS vector.

`argon2-cffi` exposes `check_needs_rehash()`, so parameters can be raised over
time and existing hashes upgraded transparently on next successful login.

---

## 4.9 The analytics engine

This is where the Part 1 §1.12 registry becomes machinery. Four stages.

### Stage 1 — Registry (declaration)

```python
@dataclass(frozen=True)
class MetricDef:
    key: str                       # "bounce_rate"
    label: str                     # "Bounce rate"
    description: str               # drives the D-03 shared tooltip
    kind: Literal["count", "ratio", "duration", "approx_distinct"]
    additive: bool                 # can it be summed across buckets?
    sources: Mapping[SourceKey, ColumnExpr]   # per-source SQL expression
    numerator: str | None          # for ratios
    denominator: str | None
    format: Literal["integer", "percent", "duration", "decimal"]
```

The `sources` mapping is load-bearing: it says *which tables can serve this
metric and how*. `pageviews` is `SUM(pageviews)` on `agg_daily_totals` but
`COUNT(*) FILTER (WHERE event_name='pageview')` on `events_raw`. Same metric,
different expression per source, declared once.

`additive` prevents a real class of bug: `bounce_rate` cannot be averaged across
days to get a range bounce rate. It must be recomputed as
`SUM(bounces)/SUM(sessions)`. The flag makes the compiler enforce that rather
than relying on whoever writes the query remembering.

Dimensions declare analogously, plus a `cardinality_class` (low / medium /
unbounded) which the planner uses to decide whether a `GROUP BY` needs a
`LIMIT` and a "(other)" bucket.

### Stage 2 — Planner (routing)

Input: a validated `ReportRequest` (metrics, dimensions, date range,
granularity, filters, segment, comparison).

Output: a `QueryPlan` naming the chosen source table, the resolved time buckets
in property-local time, the compiled filter AST, and — critically — whether
the range must be **split** across sources (Part 2 §2.6: closed days from
`agg_daily`, today from `agg_hourly`).

The routing algorithm is Part 2 §2.6's ladder. The planner is pure: request in,
plan out, no I/O. That makes it exhaustively unit-testable, which matters
because routing bugs produce *wrong numbers*, not errors — the worst kind of
bug in an analytics product.

### Stage 3 — Compiler (SQL generation)

`QueryPlan` → SQLAlchemy Core `Select`. Handles `GROUP BY` construction,
ratio-metric recomputation, time-bucket generation (including empty buckets via
`generate_series` left-joined to results, so a chart doesn't skip days with no
traffic), `LIMIT` + "(other)" rollup for unbounded dimensions, and the
union-across-sources seam.

### Stage 4 — Executor (repository)

`aggregate_repo.execute_report(plan)`. Applies a statement timeout scaled to the
source (500 ms for rollups, 10 s for raw), runs on the read replica, and
returns typed rows.

### Comparison periods

A request with `compare: "previous_period"` runs the plan twice with shifted
ranges and the service merges them. **Not a single self-joined query** — two
simple queries that each hit the rollup index cleanly are faster and far easier
to reason about than one clever query, and both benefit from the response cache
independently.

Timezone-aware period shifting is subtle (previous month has a different number
of days; previous year crosses a DST boundary) and lives in
`analytics/timeranges.py` with its own test suite.

---

## 4.10 Working backwards from the frontend contract

Part 0 §0.4.4 noted that with no existing backend, the compensating discipline
is to design around the frontend conventions that *do* exist. Concretely:

**One report endpoint, not thirty.**

```
POST /api/v1/properties/{id}/reports
```

Body: metrics, dimensions, date range, granularity, filters, segment,
comparison, limit, order.

**Why POST for a read.** Report requests carry structured filter trees that do
not encode cleanly or readably in a query string, and URL length limits are a
real constraint with complex segments. The tradeoff is losing HTTP caching and
`GET` semantics — recovered by returning an explicit `ETag` and by TanStack
Query keying its cache on the request body (Part 7 §7.8). A `GET` variant with a
compact encoded filter param can be added later for shareable report URLs.

**Why one endpoint.** The frontend's `endpoints/` folder (Part 0, Part 7 §7.6)
becomes a small set of typed request builders rather than thirty hand-written
functions, TanStack Query keys derive mechanically from the request object, and
adding a report is a frontend-only change once the metric exists in the
registry. This is the frontend-side payoff of D-04.

**Response envelope**, uniform across every endpoint:

```jsonc
{
  "data": { "rows": [...], "totals": {...}, "comparison": {...} },
  "meta": {
    "source": "agg_daily",        // which table answered — visible in dev tools
    "sampled": false,
    "approximate": ["unique_visitors"],   // drives the A-07 UI disclosure
    "query_ms": 43,
    "cache": "hit",
    "timezone": "Europe/London"
  }
}
```

The `approximate` array is how the HLL caveat (§3.7 / A-07) reaches the UI
mechanically rather than by a developer remembering to hard-code a tooltip on
the right widget.

**Error envelope**, also uniform:

```jsonc
{
  "error": {
    "code": "property_not_found",     // stable, machine-readable
    "message": "Property not found.", // human, safe to display
    "details": [ { "field": "date_from", "issue": "must be before date_to" } ],
    "request_id": "01JQ..."
  }
}
```

Stable `code` strings mean the frontend branches on codes, never on message
text. `request_id` matches the log correlation id so a user-reported error is
traceable in one grep.

---

## 4.11 Error handling

A single exception hierarchy in `core/exceptions.py`:

```
AppError(code, message, status, details)
├── ValidationError        → 422
├── AuthenticationError    → 401
├── AuthorizationError     → 403
├── NotFoundError          → 404
├── ConflictError          → 409
├── RateLimitError         → 429
├── QuotaExceededError     → 402
└── UpstreamError          → 502/503
```

**Rules:**

- **Services raise domain errors.** `PropertyNotFoundError`, not
  `HTTPException`. A service must be callable from a worker, where
  `HTTPException` is meaningless.
- **One exception handler** registered on each app translates `AppError` →
  the §4.10 envelope. Routers contain no try/except for expected conditions.
- **Unexpected exceptions** are caught by a catch-all handler that logs with
  full context and returns a generic 500 with the `request_id`. **Never** leak
  a traceback or an internal message to a client.
- **Validation errors from Pydantic** are reshaped by a custom
  `RequestValidationError` handler into the same envelope, so the frontend has
  exactly one error shape to handle.

---

## 4.12 Transactions — which layer owns them

The brief asks this explicitly, and it is where layered designs most often go
wrong.

> **Decision D-16.** **The Service layer owns transaction boundaries.
> Repositories never commit.**

**Why not the repository.** If each repository method commits, a service that
must create a workspace, a membership, and a default property atomically cannot
do so — it would leave partial state on failure. Repository-level commits make
multi-repository operations impossible to make atomic, and that is not a
theoretical concern: workspace creation, property deletion, and invitation
acceptance are all multi-table.

**Why not the router.** The router would then need to know which operations
mutate, reintroducing business awareness into the HTTP layer.

**Mechanism.** A FastAPI dependency yields an `AsyncSession`; the service uses
`async with session.begin():` to demarcate. Repositories receive the session and
`flush()` when they need generated ids, but never `commit()`.

```python
# service
async def create_workspace(self, account_id, dto) -> Workspace:
    async with self.uow.begin():                       # ← boundary here
        ws = await self.workspace_repo.create(dto)
        await self.membership_repo.add(ws.id, account_id, role="owner")
        await self.property_repo.create_default(ws.id, dto.domain)
        await self.audit_repo.record("workspace.created", ws.id, account_id)
    return ws
```

**Exceptions to the rule, stated explicitly:**

- **The collector's batch flush** is its own transaction per batch, managed by
  the buffer, not by a service. It is a single-statement `COPY`.
- **Batched maintenance jobs** (Part 3 §3.10 deletes, rollup backfills) commit
  per chunk deliberately — holding one transaction across millions of rows is
  the failure mode we are avoiding. These jobs own their own commit cadence and
  are documented as such in `workers/`.

---

## 4.13 Responsibility matrix

The brief asks which layer contains what. Consolidated:

| Responsibility | Layer | Notes |
| --- | --- | --- |
| HTTP routing, methods, status codes | **Router** | |
| Request parsing & validation | **Router** (via Pydantic schema) | Structural validation only |
| Business-rule validation | **Service** | "date range exceeds plan limit" is not a schema concern |
| Response serialization | **Router** (via `response_model`) | |
| Authentication (who are you) | **Middleware + Dependency** | §4.14 |
| Authorization (may you) | **Dependency** for coarse checks, **Service** for row-level | §4.14, Part 8 §8.7 |
| Business logic & orchestration | **Service** | |
| Analytics query planning | **`analytics/planner`**, called by service | Pure |
| SQL construction | **`analytics/compiler`** + **Repository** | |
| SQL execution | **Repository** | Rule R-01 |
| Transaction boundaries | **Service** | D-16 |
| Read/write (replica/primary) routing | **Repository** | |
| Caching | **Service** | Repos stay cache-unaware and therefore honest |
| Enrichment (geo, UA, channel) | **`enrichment/`**, called by ingestion service | Pure |
| Domain error raising | **Service** | Never `HTTPException` |
| Error → HTTP translation | **Exception handler** | One place |
| Logging & correlation ids | **Middleware** | |
| Rate limiting | **Middleware** | |
| Metrics emission | **Middleware** + explicit counters in services | |
| Scheduling | **Worker settings** | |

### Review checklist (the discipline behind D-11)

A pull request touching the backend is checked against:

1. No SQL outside `repositories/`.
2. No `HTTPException` outside `api/`.
3. No `commit()` inside a repository.
4. No business branching in a router body.
5. No `os.environ` outside `core/config.py`.
6. Every new metric/dimension registered, not hard-coded into a query.
7. Every service method callable without a `Request` object (proves it works
   from a worker).

These are mechanically checkable and several should become `ruff` custom rules
or import-linter contracts rather than review folklore.

---

## 4.14 Authentication and authorization placement

Detailed in Part 8; the layering summary:

- **Middleware** extracts and verifies the JWT or session cookie, resolves the
  `Account`, and attaches it to `request.state`. It does not decide
  permissions. It runs on every API request and never on the collector.
- **`Depends(get_current_account)`** turns that into a typed dependency and
  raises 401 if absent.
- **`Depends(require_workspace_role("admin"))`** performs coarse, route-level
  authorization by resolving the path's workspace and checking membership role.
- **Services perform row-level checks** — "does this goal belong to a property
  in a workspace this account can access." A dependency cannot do this
  generally, because it does not know the object graph.

**Tenancy enforcement is the security-critical part.** Every analytics query
must be scoped to a `property_id` the caller may access. The mechanism: the
report service receives an `AuthContext` carrying the set of authorized
property ids, and the compiler **injects `property_id = ANY(:authorized)` into
every generated query** — it is not possible to compose a report query without
it, because the compiler requires the context to build at all.

Making tenancy structurally unforgettable rather than a thing each endpoint
remembers is the single most important security decision in the backend. Part 8
§8.7 and Part 10 §10.7 cover the test strategy that proves it holds.

---

## 4.15 What Part 5 must resolve

Part 4 has fixed the code structure. Part 5 specifies the collector in detail:
the tracking script's design and payload, the transport choice, bot filtering,
the enrichment implementations, the session-lookup cache protocol, and the
buffer's exact flush and shutdown semantics.
