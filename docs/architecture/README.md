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
| 7 | [Frontend Architecture](07-frontend-architecture.md) | The ten folders, state split, query keys, components, routing, motion/illustration design system, responsive design |
| 8 | [Auth, Tenancy & Access Control](08-auth-and-tenancy.md) | Tokens, two-axis RBAC, per-property access, invitations, API keys |
| 9 | Migrations & Alembic | *pending* |
| 10 | Operations | *pending* |
| 11 | Delivery Roadmap | *pending* |
| 12 | [Billing & Subscriptions (Razorpay)](12-billing-razorpay.md) | Per-seat subscriptions, entitlements, quotas, webhooks, GST |

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
| D-17 | TanStack Router over React Router, for typed URL search state | Part 7 §7.3 |
| D-18 | No new top-level frontend folders; Jotai atoms live in `context/atoms/` | Part 7 §7.4 |
| D-19 | B2C and B2B are one tenancy model at different seat counts, not two models | Part 8 §8.1 |
| D-20 | In-memory access JWT + httpOnly rotating refresh token | Part 8 §8.4 |
| D-21 | Permissions resolved per request from the DB, not embedded in the token | Part 8 §8.4 |
| D-22 | One Razorpay subscription per workspace, priced per seat; events are capped, not metered | Part 12 §12.1 |
| D-23 | Never stop ingesting events for non-payment — degrade reporting instead | Part 12 §12.7 |
| D-24 | Framer Motion for animation; generated inline SVG/CSS illustration, no external image assets | Part 7 §7.17 |

## Project-directed constraints

Choices set by the project rather than derived in this plan. Recorded so their
consequences are traceable.

| ID | Constraint | Consequence |
| --- | --- | --- |
| C-01 | shadcn is the Base UI (`base-nova`) flavour — all components added via CLI, no Radix | Part 0 §0.3.3 |
| C-02 | **Axios** for HTTP, not `fetch` | Interceptors carry auth, error normalization, and 401-refresh — Part 7 §7.5 |
| C-03 | **No Zod** | URL search params and env vars get hand-written validators; `parseFilterTree` becomes a tested pure function — Part 7 §7.12 |

## Standing rules

| ID | Rule | Where |
| --- | --- | --- |
| R-01 | All SQL lives in `repositories/`. No exceptions. | Part 4 §4.6 |
| R-02 | All query keys come from the `api/query-keys.ts` factory | Part 7 §7.8 |
| R-03 | TanStack Query owns server state, Jotai owns client state, the URL owns shareable state | Part 7 §7.9 |
| R-04 | `analytics/` components compose `ui/` primitives; `ui/` is never hand-edited | Part 7 §7.10 |
| R-05 | `types/` emits zero JavaScript | Part 7 §7.13 |
| R-06 | Every workspace has at least one `owner` at all times | Part 8 §8.3 |
| R-07 | Every tenant-scoped endpoint has a cross-tenant isolation test; CI enforces it | Part 8 §8.7 |
| R-08 | Entitlements are checked in the service layer at the moment of action | Part 12 §12.5 |
| R-09 | `subscriptions.quantity >= COUNT(memberships)` at all times | Part 12 §12.6 |
| R-10 | Verify webhook signatures against raw bytes, before parsing, in constant time | Part 12 §12.9 |
| R-11 | Every subscription state transition is guarded by a monotonic timestamp check | Part 12 §12.9 |
| R-12 | Nightly reconciliation of local billing state against Razorpay | Part 12 §12.10 |
| R-13 | Every screen must be fully usable at desktop, tablet, and mobile widths — no exceptions for the dashboard | Part 7 §7.18 |

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
| A-09 | Decide whether to keep the ~8 unused shadcn components (recommend: keep, mark `ui/` as CLI-managed) | 0 §0.3.0 |
| A-10 | **Verify the current RBI AFA threshold against worst-case invoice size before fixing prices** | 12 §12.2 |
| A-11 | Accountant review of GST treatment, place-of-supply, and invoice format | 12 §12.2 |
| A-12 | Decide annual billing (interacts with A-10) | 12 §12.13 |
| A-13 | Confirm whether non-INR international customers are in scope | 12 §12.13 |

---

## Conventions

- Cross-references use *Part N §N.M*.
- `D-nn` are decisions; `F-nn` are audit findings; `A-nn` are action items;
  `R-nn` are standing rules.
- Code appears only as illustrative DDL, type signatures, and directory trees.
  Per the brief, this plan does not contain application code.
