# Analytics Platform — Technical Architecture & Implementation Plan

A production-oriented plan for building a Google Analytics–like measurement
platform on the existing `analytics-frontend` / `analytics-backend` codebase.

**Audience:** engineers implementing the system, and reviewers assessing the
approach before implementation starts.
**Status:** draft for review.
**Baseline commit:** `4cb8beb`. Audit performed 2026-09-02.

---

## Read this first

**[Part 0 — Codebase Audit](00-codebase-audit.md)** is ground truth. It records
what actually exists today, which is not what the project brief assumes. In
particular: the frontend's nine `src` subfolders are **empty**, Jotai / TanStack
Query / a router are **not installed**, the backend is **an empty venv plus a
requirements file**, and the shadcn setup is the **Base UI** flavour rather than
Radix. Every later part is written against those findings.

---

## Contents

| Part | Document | What it settles |
| --- | --- | --- |
| 0 | [Codebase Audit](00-codebase-audit.md) | What exists; 8 findings, 8 action items |
| 1 | [Product Scope & Domain Model](01-product-scope-and-domain.md) | Three-tier scope, event model, identity, metric definitions |
| 2 | [System Architecture](02-system-architecture.md) | Four deployables, write/read path separation, Redis's roles |
| 3 | [Database Architecture](03-database-architecture.md) | Schemas, partitioning, the rollup strategy, HLL, retention |
| 4 | [Backend Architecture](04-backend-architecture.md) | FastAPI layering, repositories, transactions, the query engine |
| 5 | Ingestion Pipeline | *pending* |
| 6 | Background Processing | *pending* |
| 7 | Frontend Architecture | *pending* |
| 8 | Auth & Multi-Tenancy | *pending* |
| 9 | Migrations & Alembic | *pending* |
| 10 | Operations | *pending* |
| 11 | Delivery Roadmap | *pending* |

---

## Decision register

Decisions that are expensive to reverse. Each is argued where it is made.

| ID | Decision | Where |
| --- | --- | --- |
| D-01 | Cookieless daily-rotating visitor hash; optional `user_id` opt-in | Part 1 §1.7 |
| D-02 | Partition raw events by `received_at`; report on `occurred_at` | Part 1 §1.10 |
| D-03 | Single shared metric-definition registry drives both UI tooltips and backend SQL | Part 1 §1.11 |
| D-04 | Registry-driven query composition from day one | Part 1 §1.12 |
| D-05 | Collector and API are separate deployables from one codebase | Part 2 §2.3 |
| D-06 | In-process batch buffer **and** Redis Stream, with a reconciliation job | Part 2 §2.4 |
| D-07 | PostgreSQL with a designed-in ClickHouse exit ramp | Part 2 §2.8 |
| D-08 | Derive the daily salt via HKDF rather than storing a random value | Part 2 §2.9 |
| D-09 | `pg_partman` where available, worker fallback, always a `DEFAULT` partition | Part 3 §3.4 |
| D-10 | Tiered purpose-built rollups with raw fallback and usage-driven promotion | Part 3 §3.6 |
| D-11 | **No separate Controller layer** — the FastAPI router is the controller | Part 4 §4.1 |
| D-12 | `pyproject.toml` + `uv` replaces `requirements.txt` | Part 4 §4.4 |
| D-13 | `arq` over Celery | Part 4 §4.5 |
| D-14 | ORM for `core.*`, SQLAlchemy Core for `analytics.*`, `COPY` for bulk insert | Part 4 §4.6 |
| D-15 | Argon2id over bcrypt | Part 4 §4.8 |
| D-16 | Services own transaction boundaries; repositories never commit | Part 4 §4.12 |

## Action register

Concrete work items surfaced by the audit and the design.

| ID | Action | Part |
| --- | --- | --- |
| A-01 | Commit real files into the nine empty frontend folders | 0 §0.2 |
| A-02 | Enable `"strict": true` in `tsconfig.app.json` before feature code | 0 §0.3.4 |
| A-03 | Design light/dark categorical, sequential, and diverging chart palettes | 0 §0.3.5 |
| A-04 | CI job running a clean `npm ci && npm run build` | 0 §0.3.8 |
| A-05 | Re-encode `requirements.txt` as UTF-8, or migrate to `pyproject.toml` | 0 §0.4.3 |
| A-06 | Document that `events_raw` column order is alignment-driven | 3 §3.3 |
| A-07 | Disclose HLL approximation and daily-identity semantics in the UI | 3 §3.7 |
| A-08 | Configure asyncpg for PgBouncer transaction mode from the first commit | 3 §3.12 |

---

## Conventions

- Cross-references use *Part N §N.M*.
- `D-nn` are decisions; `F-nn` are audit findings; `A-nn` are action items;
  `R-nn` are standing rules.
- Code appears only as illustrative DDL, type signatures, and directory trees.
  Per the brief, this plan does not contain application code.
