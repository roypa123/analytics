# Part 7 — Frontend Architecture

> Depends on: Part 0 (F-01…F-06, rev. 2), Part 4 §4.10 (the API contract).
> Feeds: Part 8 (protected routes), Part 11 (delivery order).

---

## 7.1 The organizing principle

The repository has committed to **horizontal folders**: `api`, `config`,
`context`, `endpoints`, `hooks`, `lib`, `pages`, `routing`, `types`, `utils`.
That is a layer-first structure, not a feature-first one.

The common criticism of layer-first is that adding a feature means touching
eight folders. That is true, and it is worth being clear-eyed about it — but
the alternative (`features/reports/{api,hooks,types,components}`) is not
obviously better at this size, and **the repository has already chosen.** The
brief is explicit: *"Do not unnecessarily introduce another frontend
architecture pattern if the current structure already supports the
application."*

So the design principle for this part is:

> **Horizontal folders, vertical slices.** Each folder is a layer. Each feature
> is a consistently-named file appearing at the same position in every layer it
> needs. The convention is what makes the layer-first structure navigable.

Concretely, the `reports` feature is:

```
src/types/api/report.ts          ← the wire contract
src/endpoints/reports.ts         ← how to call it
src/hooks/queries/use-report.ts  ← how React consumes it
src/context/atoms/report.ts      ← client-side UI state for it
src/pages/reports/               ← the screens
src/components/analytics/        ← the widgets those screens compose
```

Six files, six predictable locations. Once a developer has built one feature,
they know where every file of the next one goes. **That predictability is the
entire payoff of layer-first**, and it only holds if the naming is disciplined
— which is why §7.14 specifies the naming rules as a binding convention rather
than a suggestion.

---

## 7.2 Dependencies to add

Resolving Part 0 F-01. Revision 2 already supplied charting and dates.

```jsonc
{
  // state
  "jotai": "^2.11",                        // brief-specified; client state
  "@tanstack/react-query": "^5.62",        // brief-specified; server state
  "@tanstack/react-query-devtools": "^5.62",

  // routing
  "@tanstack/react-router": "^1.95",       // see §7.3 for the decision
  "@tanstack/router-devtools": "^1.95",

  // http
  "axios": "^1.7",

  // forms
  "react-hook-form": "^7.54",

  // motion
  "framer-motion": "^11",                  // D-24; marketing, auth, and dashboard-shell animation

  // testing (dev)
  "vitest": "^2.1",
  "@testing-library/react": "^16.1",
  "@testing-library/user-event": "^14.5",
  "msw": "^2.7",                           // mock the API in tests + dev
  "jsdom": "^25"
}
```

**Axios**, per project direction. It brings a genuine benefit over bare `fetch`
for this application: **interceptors**. The 401-refresh-and-retry flow (Part 8
§8.11) and auth-header injection are naturally expressed as a request/response
interceptor pair in one place, whereas with `fetch` they must be hand-rolled
into a wrapper. Axios also throws on non-2xx by default — which is what
TanStack Query expects — gives `timeout` as a first-class option, and supports
`AbortSignal` (v1+) so query cancellation still works.

The costs, noted for the record: ~13 kB gzipped, and a layer between the code
and the platform. Both are acceptable given the interceptor payoff.

**No Zod**, per project direction. This has one real consequence worth calling
out: URL search params (§7.3) and environment variables (§7.13) are still
untrusted input that must be *parsed*, not cast. Without a schema library, those
validators are **hand-written functions** in `routing/search-validators.ts` and
`config/env.ts`. TanStack Router's `validateSearch` accepts any
`(input: unknown) => T` function, so type inference downstream is unaffected —
only the authoring is manual. §7.12 specifies the shape.

Form validation uses **react-hook-form's built-in rules** (`required`,
`pattern`, `min`, `validate`) rather than a resolver. Sufficient for the forms
this product has: login, property settings, goal definitions, invitations.

> **Rule R-14.** Every field gets validated on the frontend **and** the
> backend, independently. The two are not the same check duplicated for
> style — they serve different purposes and neither can substitute for the
> other. Frontend rules (react-hook-form's `required`/`pattern`/`minLength`,
> the hand-written validators above) exist for **UX**: instant feedback
> without a round trip, and they are trivially bypassed (disabled JS, a raw
> `curl` to the API, a modified request). Backend validation (the Pydantic
> schema at the router, per Part 4 §4.13) is what actually protects the data
> — it is the only check that cannot be skipped by the client. Concretely:
> a password's `minLength: 12` in `register-page.tsx`'s form rules and
> `Field(min_length=12)` in `RegisterRequest` (`app/schemas/auth.py`) are
> **two separate assertions of the same constraint**, not one implemented
> twice by accident — deleting either one is a regression, not cleanup.

**Framer Motion**, per D-24, for the visual-design pass covering the marketing
landing page, the auth pages, and the dashboard shell's entrance/transition
motion. See §7.17 for where it lives and how it is bounded.

---

## 7.3 Routing: TanStack Router

> **Decision D-17.** **TanStack Router**, not React Router.

This is a genuine fork and the repository has not foreclosed it (`src/routing/`
is empty). The deciding argument is specific to analytics products.

**An analytics dashboard's state is its URL.** Date range, granularity,
comparison mode, active filters, selected segment, breakdown dimension, sort
order, and page — all of it must be shareable, bookmarkable, and
back-button-correct. "Send me the link to that report" is a core workflow.

With React Router, search params are `URLSearchParams` — strings, untyped,
manually parsed and serialized at every read and write site. With a report
state of a dozen fields including a nested filter tree, that is a large,
error-prone surface, and every bug in it produces a report showing the wrong
numbers.

TanStack Router treats search params as **first-class typed state**, declared
per route by a validator function:

```ts
// routing/routes/report.route.ts — illustrative signature only
validateSearch: validateReportSearch,   // (input: unknown) => ReportSearch
```

From that one declaration you get parsing, validation, defaulting, type-safe
`navigate({ search })`, type-safe `useSearch()`, and structural sharing so a
component only re-renders when the slice it reads changes.

**Without Zod the validator is hand-written**, but the router's contract is
just `(input: unknown) => T` — the type safety flows from the validator's
*return type*, not from the schema library. So the benefit that motivates this
decision survives intact; only the authoring of the validators is manual
(§7.12).

**Supporting reasons:**

- Same authors as TanStack Query; the loader/query integration is deliberate.
- Fully type-safe route params and links — a typo'd path is a compile error.
- Built-in search-param serialization control, which matters for keeping filter
  trees readable in a URL.

**Costs, stated honestly:**

- Smaller community than React Router; fewer StackOverflow answers.
- Steeper initial learning curve, particularly the route-tree typing.
- We use the **code-based** route tree, not the file-based generator, to avoid
  adding a codegen step to the Vite build and to keep routes inside
  `src/routing/` where the repository's convention says they belong.

**If the team already knows React Router well**, v7 with a hand-rolled typed
search-param layer is a defensible alternative — but that layer is
approximately what TanStack Router already is, built worse.

---

## 7.4 Folder responsibilities

The brief asks for the responsibility of every existing folder. This is the
contract; §7.5–7.10 give the contents.

| Folder | Owns | Must not contain | May import from |
| --- | --- | --- | --- |
| **`api/`** | HTTP transport. The axios instance, interceptors (auth, error normalization, 401 refresh), the QueryClient instance. | Any knowledge of specific resources or URLs | `config`, `types`, `utils` |
| **`endpoints/`** | One module per API resource: URL builders and typed request functions. The complete map of "what the server offers." | React, hooks, caching, component code | `api`, `types`, `config`, `utils` |
| **`hooks/`** | React hooks. TanStack Query wrappers (`queries/`, `mutations/`), and UI hooks. | Direct `client` calls, URL strings, business rules | everything except `pages`, `components` |
| **`types/`** | TypeScript types only. Zero runtime output. | Values, functions, constants | `types` only |
| **`config/`** | Compile-time and env constants, plus the metric/dimension registry and route-path constants. | Runtime state, React | `types` |
| **`context/`** | React providers, React contexts, and Jotai atoms (§7.9). | Data fetching, business logic | `types`, `config`, `utils`, `api` |
| **`routing/`** | The router instance, route tree, search-param schemas, and route guards. | Page markup | `pages`, `context`, `config`, `types` |
| **`pages/`** | Route-level components. Layout composition, data-hook wiring, page-specific glue. | Reusable widgets, `fetch`, styling systems | everything |
| **`components/`** | All reusable UI. Four subfolders (§7.10). | Route knowledge, `fetch` | `hooks`, `types`, `lib`, `utils`, `config` |
| **`lib/`** | Third-party integration seams. `cn()`, date-fns formatter wrappers, chart theming helpers. **Partly CLI-managed.** | Domain logic | `types`, `utils`, `config` |
| **`utils/`** | Pure, dependency-free functions. Unit-testable in isolation. | React, any `src/` import except `types` | `types` only |

### Resolving the two ambiguous adjacencies

Part 0 F-06 flagged these. The tests:

**`lib/` vs `utils/`** — *"Does it exist because of a third-party library?"*
Yes → `lib/`. No → `utils/`.
`cn()` exists because of clsx + tailwind-merge → `lib/`. `formatDuration(seconds)`
is pure arithmetic → `utils/`. `formatDateRange()` uses date-fns → `lib/`.
Note `lib/utils.ts` is pinned by `components.json` and cannot move.

**`api/` vs `endpoints/`** — *"Would this change if we switched from REST to
GraphQL?"*
`api/` would be rewritten; `endpoints/` would be rewritten. But *`api/` does not
know what a Property is* and `endpoints/` does. `api/` is the pipe;
`endpoints/` is what flows through it. If you find yourself importing a URL
string into `api/`, the boundary has been crossed.

### New folders

> **Decision D-18.** **No new top-level folders.** The ten existing folders plus
> `components/` and `assets/` cover every need. Two near-misses, and why they
> are not new folders:
>
> - **A `store/` for Jotai** — rejected; atoms go in `context/atoms/` (§7.9).
> - **A `features/` tree** — rejected; §7.1.

Subfolders *within* the existing folders are used freely — that is not a new
architecture, it is organization within the committed one.

---

## 7.5 `api/` — the transport layer

```
src/api/
├── client.ts             # the configured axios instance
├── interceptors/
│   ├── auth.ts           # request: attach bearer token
│   ├── error.ts          # response: normalize to ApiError
│   └── refresh.ts        # response: 401 → refresh → retry (Part 8 §8.11)
├── errors.ts             # ApiError class + type guards
├── query-client.ts       # the QueryClient instance + global defaults
└── query-keys.ts         # the key factory (§7.8)
```

**`client.ts`** creates one axios instance and registers the interceptors:

```ts
// shape only
export const client = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: 30_000,
  withCredentials: true,        // the httpOnly refresh cookie rides along
  headers: { 'Content-Type': 'application/json' },
})
```

`withCredentials: true` is required and easy to forget — the refresh token is
an httpOnly cookie (Part 8 §8.4), and without this flag it is never sent,
producing a login loop that only manifests after the first access token
expires.

### The three interceptors

**`auth.ts` (request).** Reads the access token from the Jotai store and sets
`Authorization: Bearer …`. Reads from the store's `get()` rather than a hook,
since interceptors run outside React.

**`error.ts` (response, rejection path).** The critical one. It maps every
failure into a single `ApiError` type:

| Axios failure | Mapped to |
| --- | --- |
| Response with the Part 4 §4.10 envelope | `ApiError` with `code`, `message`, `details`, `requestId` |
| Response without an envelope (proxy 502, HTML error page) | `ApiError` with `code: 'unexpected_response'` |
| `ECONNABORTED` (timeout) | `ApiError` with `code: 'timeout'` |
| Network failure, no response | `ApiError` with `code: 'network_error'` |
| `ERR_CANCELED` | **Re-thrown as-is** — see below |

That normalization is the whole reason this layer exists. Because the backend
guarantees exactly one error shape, the frontend can guarantee exactly one
error type, and every consumer — query hooks, mutation `onError`, the error
boundary — branches on a **stable `code` string, never on message text**.

**Cancellation must pass through unchanged.** TanStack Query cancels in-flight
requests when a query key changes — which on a dashboard happens on every date
range change. Axios surfaces these as `ERR_CANCELED`, and if the interceptor
converts them into an `ApiError` the UI will render "network error" toasts
during perfectly normal interaction. Check `axios.isCancel(err)` first and
re-throw. This is the most common axios-plus-TanStack-Query bug.

**`refresh.ts` (response, 401 path).** Implements the shared-promise refresh
described in Part 8 §8.11: on 401, call the refresh endpoint **once** across all
concurrent failures, then replay the queued requests. Axios interceptors make
this natural — the interceptor returns `client(originalConfig)` to retry — but
two guards are essential:

1. **Never retry the refresh endpoint itself**, or a failed refresh recurses
   until the stack blows.
2. **Retry each request at most once** (a `_retried` flag on the config), or a
   persistently-401ing endpoint loops forever.

**`query-client.ts`** sets defaults that suit analytics specifically:

| Option | Value | Why |
| --- | --- | --- |
| `staleTime` | 60_000 | Analytics data is not live; refetching on every focus is wasteful and makes numbers flicker |
| `gcTime` | 5 min | |
| `refetchOnWindowFocus` | `false` | A user tabbing back should not see numbers change under them mid-analysis |
| `retry` | 1, and **0 for 4xx** | Retrying a 403 or a validation error is pointless |
| `throwOnError` | for 5xx only | Route render errors to the error boundary; handle 4xx in-component |

`refetchOnWindowFocus: false` is a deliberate departure from TanStack's default
and it matters: an analyst comparing two numbers must not have one of them
silently change because they alt-tabbed.

---

## 7.6 `endpoints/` — the API surface map

One module per backend resource. This folder is the complete, greppable answer
to "what can the frontend ask the server for."

```
src/endpoints/
├── index.ts           # barrel re-export
├── paths.ts           # every URL in one place
├── auth.ts            # login, logout, refresh, register, verify, reset
├── accounts.ts        # me, updateProfile, changePassword, mfa
├── workspaces.ts      # list, get, create, update, members, invitations
├── properties.ts      # list, get, create, update, delete, trackingSnippet
├── goals.ts           # CRUD
├── segments.ts        # CRUD
├── reports.ts         # runReport (the Part 4 §4.10 single endpoint)
├── realtime.ts        # overview, topPages, topReferrers
└── exports.ts         # requestExport, getExportStatus, downloadUrl
```

**`paths.ts` centralizes URLs.** Not a stylistic preference — it means a
backend route rename is a one-file change, and it makes the MSW handlers in
tests (§7.15) share the same source of truth as production code, so a mock can
never silently diverge from a real path.

**Each endpoint function is a plain async function.** No React, no caching, no
hooks:

```ts
// endpoints/reports.ts — signature only
export function runReport(
  propertyId: PropertyId,
  body: ReportRequest,
  signal?: AbortSignal
): Promise<ReportResponse>
```

**Why keep this separate from the hooks that call it.** Three reasons: the same
call is often needed outside React (a router loader, a prefetch, a test setup);
it keeps `hooks/` focused on caching policy rather than transport detail; and
it means the entire API surface can be reviewed in one folder without reading
React code.

**The payoff of Part 4 §4.10's single report endpoint** lands here. Instead of
thirty endpoint functions for thirty reports, `reports.ts` has essentially one,
and the variation moves into typed request builders driven by the registry in
`config/`. Adding "top browsers by conversion rate" is a config change, not a
new endpoint, a new hook, and a new type.

---

## 7.7 `hooks/` — React consumption

`use-mobile.ts` already lives here (Part 0 §0.3.0) and sets the convention:
kebab-case file, named export, `use` prefix. We follow it.

```
src/hooks/
├── queries/                       # TanStack Query reads
│   ├── use-report.ts
│   ├── use-realtime-overview.ts
│   ├── use-properties.ts
│   ├── use-property.ts
│   ├── use-goals.ts
│   ├── use-segments.ts
│   ├── use-workspaces.ts
│   └── use-current-account.ts
├── mutations/                     # TanStack Query writes
│   ├── use-login.ts
│   ├── use-logout.ts
│   ├── use-create-property.ts
│   ├── use-update-property.ts
│   ├── use-delete-property.ts
│   ├── use-create-goal.ts
│   ├── use-save-segment.ts
│   └── use-invite-member.ts
├── analytics/                     # composed, domain-aware hooks
│   ├── use-date-range.ts          # reads/writes the URL search param
│   ├── use-report-filters.ts
│   ├── use-comparison.ts
│   └── use-metric-formatter.ts
├── ui/
│   ├── use-debounced-value.ts
│   ├── use-copy-to-clipboard.ts
│   ├── use-media-query.ts
│   └── use-local-storage.ts
└── use-mobile.ts                  # pre-existing, left in place
```

**Why `queries/` and `mutations/` are split.** They have genuinely different
shapes and concerns — queries care about keys, `staleTime`, and `select`;
mutations care about invalidation, optimistic updates, and toasts. Mixing them
in one flat folder means every file read starts with "which kind is this."

**Why `analytics/` hooks are separate from `queries/`.** These do not fetch.
`use-date-range` reads the URL search param, applies the property's timezone,
and returns resolved `from`/`to` dates plus a setter that navigates. It is
domain logic expressed as a hook. Putting it next to `use-report` would blur
"talks to the server" with "manages report state," which is exactly the
distinction Part 7 is trying to keep sharp.

**A query hook's job is thin:**

```ts
// hooks/queries/use-report.ts — shape only
export function useReport(propertyId: PropertyId, request: ReportRequest) {
  return useQuery({
    queryKey: queryKeys.reports.run(propertyId, request),
    queryFn: ({ signal }) => runReport(propertyId, request, signal),
    staleTime: request.includesToday ? 60_000 : 10 * 60_000,
    placeholderData: keepPreviousData,
  })
}
```

Two details carry real weight:

- **`placeholderData: keepPreviousData`** — when the user changes the date
  range, the old chart stays on screen (dimmed) while the new data loads,
  instead of collapsing to a skeleton. On a dashboard where every control
  triggers a refetch, this is the difference between a calm UI and a flickering
  one.
- **Range-dependent `staleTime`** — closed historical ranges are immutable, so
  cache them hard; ranges including today change and should not. This mirrors
  the backend's own cache TTL policy (Part 2 §2.6), and the two should agree.

---

## 7.8 TanStack Query key organization

Query keys are the cache's addressing scheme. Ad-hoc inline arrays are the most
common cause of "why didn't my invalidation work."

> **Rule R-02.** All query keys come from the `api/query-keys.ts` factory. No
> inline key arrays anywhere in the codebase.

```ts
// api/query-keys.ts — shape only
export const queryKeys = {
  properties: {
    all:    ()             => ['properties'] as const,
    lists:  ()             => [...queryKeys.properties.all(), 'list'] as const,
    list:   (ws: WorkspaceId) => [...queryKeys.properties.lists(), ws] as const,
    detail: (id: PropertyId)  => [...queryKeys.properties.all(), 'detail', id] as const,
  },
  reports: {
    all: (p: PropertyId)   => ['reports', p] as const,
    run: (p: PropertyId, r: ReportRequest) =>
           [...queryKeys.reports.all(p), normalizeReportRequest(r)] as const,
  },
  realtime: {
    overview: (p: PropertyId) => ['realtime', p, 'overview'] as const,
  },
} as const
```

**The hierarchy is what makes invalidation work.** Because
`reports.run(p, r)` is prefixed by `reports.all(p)`, invalidating
`queryKeys.reports.all(propertyId)` clears every cached report for that
property in one call — which is exactly what you want after a backfill, a
timezone change, or a goal edit that alters conversion numbers.

**`normalizeReportRequest` is essential and easy to miss.** The report request
is a structured object, and TanStack Query hashes keys by value — but
`{metrics: ['a','b']}` and `{metrics: ['b','a']}` are the same request and must
produce the same key, or the cache fragments and hit rate collapses. The
normalizer sorts arrays, drops undefined fields, and canonicalizes the date
range to resolved ISO dates. It is a pure function in `utils/` with its own
tests.

**Mutation invalidation is declared per mutation:**

| Mutation | Invalidates |
| --- | --- |
| `useCreateProperty` | `properties.lists()` |
| `useUpdateProperty` | `properties.detail(id)`, `properties.lists()` |
| `useCreateGoal` | `goals.list(propertyId)`, `reports.all(propertyId)` |
| `useSaveSegment` | `segments.list(propertyId)` — **not** reports; a saved segment does not change existing report results |

That last row shows why the mapping is written down rather than guessed:
over-invalidating a report key throws away expensive cached aggregates for no
reason.

---

## 7.9 `context/` — providers and Jotai atoms

### The state-split rule

> **Rule R-03.** **TanStack Query owns anything that came from the server.
> Jotai owns anything that did not. The URL owns anything shareable.**

Three stores, zero overlap. The failure mode this prevents — copying server
data into Jotai atoms — creates two sources of truth that drift, and it is the
single most common way TanStack Query gets misused.

| State | Home | Why |
| --- | --- | --- |
| Report data, properties, goals, account | **TanStack Query** | Server-owned |
| Date range, filters, comparison, breakdown dim | **URL** (TanStack Router search) | Must be shareable (§7.3) |
| Selected workspace / property | **URL path param** | Part of the address |
| Auth tokens, current account id | **Jotai** (+ storage) | Client-only, cross-cutting |
| Theme (light/dark) | **Jotai** (+ localStorage) | Client-only preference |
| Sidebar collapsed, table density, chart type | **Jotai** (+ localStorage) | Per-user UI preference |
| Open dialogs, transient selections | **Jotai** or local `useState` | Ephemeral |
| Unsaved segment-builder draft | **Jotai** | Complex, cross-component, not yet server state |

### Why atoms live in `context/`, not a new `store/`

Part 0's folder list has no `store/`, and D-18 says no new top-level folders.
Jotai atoms are defensibly at home in `context/` because Jotai's `Provider` *is*
a React context, and the folder's charter — "cross-cutting client state and the
providers that supply it" — describes atoms precisely. A `store/` folder would
split one concern across two locations for no benefit.

```
src/context/
├── providers/
│   ├── app-providers.tsx      # the single composition root (§7.11)
│   ├── theme-provider.tsx     # toggles the .dark class on <html>
│   └── auth-provider.tsx      # bootstraps session, exposes AuthContext
├── atoms/
│   ├── auth.ts                # accessToken, currentAccountId, derived isAuthed
│   ├── theme.ts               # atomWithStorage<'light'|'dark'|'system'>
│   ├── preferences.ts         # sidebarCollapsed, tableDensity, defaultRange
│   └── segment-builder.ts     # the draft filter tree
└── auth-context.ts            # the React context object + typed useAuth()
```

### Atom conventions

- **`atomWithStorage` for anything that should survive reload** — theme,
  preferences, sidebar state. Not for auth tokens; see below.
- **Derived atoms over duplicated state.** `isAuthenticatedAtom` is
  `atom(get => get(accessTokenAtom) !== null)`, never a separately-maintained
  boolean.
- **Write-only atoms for actions.** `logoutAtom` is an
  `atom(null, (get, set) => …)` that clears tokens and resets the query cache,
  so the operation is defined once rather than duplicated at each call site.
- **One file per domain**, exports grouped, no barrel — barrels over atom files
  create import cycles surprisingly easily.

**Auth token storage is a security decision, not a state-management one.** The
recommendation (argued in Part 8 §8.4) is an httpOnly refresh cookie plus an
in-memory access token — so `accessTokenAtom` is a **plain atom, deliberately
not persisted**, and the session is re-established on load via the refresh
endpoint. Persisting an access token to `localStorage` makes any XSS a full
account takeover.

---

## 7.10 `components/` — four subfolders

```
src/components/
├── ui/            # 61 shadcn primitives. CLI-MANAGED. Do not hand-edit.
├── illustrations/ # generated SVG/CSS art (D-24) — no external image assets
│   ├── blob-background.tsx     # decorative animated gradient blobs
│   ├── analytics-hero.tsx      # abstract chart-motif hero illustration
│   └── grid-glow.tsx           # subtle animated backdrop for auth/empty states
├── layout/        # app shell
│   ├── app-shell.tsx           # composes sidebar + header + <Outlet/>
│   ├── app-sidebar.tsx         # built on ui/sidebar
│   ├── app-header.tsx
│   ├── property-switcher.tsx   # ui/command + ui/popover
│   ├── workspace-switcher.tsx
│   ├── user-menu.tsx           # ui/dropdown-menu
│   └── theme-toggle.tsx
├── shared/        # domain-agnostic reusables
│   ├── data-table/             # ui/table + sorting/paging/density
│   ├── page-header.tsx
│   ├── error-state.tsx         # ui/empty + retry
│   ├── loading-state.tsx       # ui/skeleton
│   ├── empty-state.tsx         # ui/empty
│   ├── confirm-dialog.tsx      # ui/alert-dialog
│   └── copy-button.tsx
└── analytics/     # the domain widgets — the heart of the product
    ├── charts/
    │   ├── time-series-chart.tsx     # ui/chart + recharts Line/Area
    │   ├── bar-breakdown-chart.tsx
    │   ├── donut-chart.tsx
    │   ├── sparkline.tsx
    │   ├── chart-empty.tsx
    │   └── chart-skeleton.tsx
    ├── controls/
    │   ├── date-range-picker.tsx     # ui/calendar + ui/popover + presets
    │   ├── comparison-toggle.tsx
    │   ├── granularity-select.tsx
    │   ├── metric-select.tsx         # driven by config/registry
    │   ├── dimension-select.tsx
    │   ├── filter-builder.tsx        # the filter tree editor
    │   └── segment-picker.tsx
    ├── metrics/
    │   ├── metric-card.tsx           # big number + delta + sparkline
    │   ├── metric-card-grid.tsx
    │   ├── metric-delta.tsx          # ↑12.4% with correct polarity
    │   └── metric-tooltip.tsx        # D-03 definition from the registry
    ├── tables/
    │   ├── breakdown-table.tsx       # the generic dimension×metric table
    │   ├── top-pages-table.tsx
    │   ├── top-referrers-table.tsx
    │   └── geo-table.tsx
    └── realtime/
        ├── realtime-counter.tsx
        ├── realtime-pulse.tsx
        ├── realtime-page-list.tsx
        └── realtime-map.tsx        # dotted-map + a precomputed grid — see §7.12
```

### The composition rule

> **Rule R-04.** `analytics/` components compose `ui/` primitives. They never
> reimplement them, and `ui/` is never hand-edited.

Part 0 F-02 makes this binding: `ui/` is vendor code managed by the shadcn CLI
in the Base UI flavour. Editing it means the next `shadcn add` either clobbers
your change or you stop updating. If a primitive needs a variant, wrap it in
`shared/` or `analytics/` — do not edit `ui/`.

Revision 2 means every primitive we need is already installed. §0.3.0's
component list maps onto this tree directly: `sidebar` → `layout/app-sidebar`,
`chart` → `analytics/charts/*`, `calendar` + `popover` →
`controls/date-range-picker`, `command` → `layout/property-switcher`, `table` →
`shared/data-table`, `skeleton`/`empty` → the loading and empty states.

### `metric-card.tsx`, as a worked example of the layering

It receives a metric key and a report result. It uses `config/registry` to
resolve the label and the definition tooltip (D-03), `lib/format` to render the
value in the metric's declared format, and `metric-delta` for the
period-over-period change. It renders `ui/card` + `ui/tooltip` + a sparkline.

What it does **not** do: fetch. The page passes data in. Every `analytics/`
component is presentational and takes data as props.

**Why that matters here specifically:** a dashboard renders 6–10 metric cards
from *one* report response. If each card fetched independently, one dashboard
load would be ten API calls returning overlapping data. Keeping fetch in the
page and data in props is not dogma — it is the difference between one request
and ten.

### `metric-delta` and polarity

A small component with a real domain trap: **up is not always good.** Sessions
up 12% is green; bounce rate up 12% is red. Polarity is declared per metric in
the registry (`higherIsBetter: boolean`) and read by this component. Hard-coding
green-for-positive produces a dashboard that lies about bounce rate, exit rate,
and load time.

---

## 7.11 Tailwind, tokens, and the chart palette

### Tailwind usage

**Tailwind v4, CSS-first. No `tailwind.config.js` is to be created** (Part 0
F-04). Theme changes are edits to the `@theme inline` block in
`src/index.css`.

Rules:

1. **Utilities inline in JSX.** No `@apply` in component files. The existing
   `@layer base` block in `index.css` is the exception and stays as-is.
2. **Semantic tokens only.** `bg-background`, `text-muted-foreground`,
   `border-border` — never `bg-white` or `text-gray-500`. Raw colors break dark
   mode silently, which is the worst way to break it.
3. **Variants via `cva`**, following `ui/button.tsx`'s pattern, for any
   component with more than two visual states.
4. **`cn()` for every conditional class.** It resolves Tailwind conflicts
   correctly; template literals do not.
5. **`data-slot` for cross-component styling hooks**, matching the Base UI
   convention already in `ui/`.

### The chart palette (A-03)

Part 0 §0.3.5 established that `--chart-1..5` are greyscale and identical across
themes — unusable. The amendment notes `chart.tsx` already supports per-theme
colors. What remains is choosing values.

**Required properties:**

| Requirement | Test |
| --- | --- |
| 8 categorical hues | Enough for a stacked breakdown before "(other)" |
| Distinguishable at 2 px | Line charts, not just filled areas |
| Distinguishable at 8 px | Legend swatches and table row dots |
| Colorblind-safe | Deuteranopia and protanopia simulation; do not rely on red/green adjacency |
| Per-theme lightness | Light theme: L ≈ 0.55–0.70. Dark theme: L ≈ 0.70–0.85. Same hue, different lightness — so a series keeps its identity across themes while staying legible against the ground |
| Consistent chroma | Roughly equal C so no series appears more important than another |

**Definition site.** Extend the `:root` and `.dark` blocks in `index.css` to
`--chart-1` … `--chart-8`, with genuinely different values per block. Then
`@theme inline` needs matching `--color-chart-6/7/8` entries.

**Consumption.** Through `ChartConfig`, which is where series identity is bound:

```ts
const config = {
  sessions: { label: 'Sessions', color: 'var(--chart-1)' },
  users:    { label: 'Users',    color: 'var(--chart-2)' },
} satisfies ChartConfig
```

**Series-to-color stability.** A dimension value must keep its color across
renders and across charts — "Organic Search" being blue in one chart and orange
in the next is actively misleading. A helper in `lib/chart-theme.ts` maps a
stable sorted dimension-value list to palette slots, so ordering changes in the
data do not reshuffle colors.

**Sequential and diverging ramps** are separate token families
(`--chart-seq-1..5`, `--chart-div-neg-2..pos-2`) for the geo heatmap and
period-over-period deltas respectively. Do not reuse the categorical hues for
these — categorical palettes have no meaningful order, and using them for
ordered data implies a ranking that is not there.

---

## 7.12 `pages/` and `routing/`

### Pages

```
src/pages/
├── marketing/
│   └── landing-page.tsx            # public "/" — hero, feature grid, CTA
├── auth/
│   ├── login-page.tsx      register-page.tsx
│   ├── forgot-password-page.tsx   reset-password-page.tsx
│   └── accept-invite-page.tsx
├── onboarding/
│   ├── create-workspace-page.tsx  create-property-page.tsx
│   └── install-snippet-page.tsx
├── dashboard/
│   └── dashboard-page.tsx          # the Tier-1 overview
├── reports/
│   └── reports-page.tsx            # interim: one page, dimension tabs — see below
│   # target shape once `runReport` (§ below) exists:
│   #   pages-report-page.tsx       sources-report-page.tsx
│   #   geo-report-page.tsx         devices-report-page.tsx
│   #   events-report-page.tsx
├── realtime/
│   └── realtime-page.tsx
├── settings/
│   ├── property-settings-page.tsx  goals-page.tsx
│   ├── segments-page.tsx           workspace-members-page.tsx
│   └── account-settings-page.tsx
└── error/
    ├── not-found-page.tsx          forbidden-page.tsx
```

**Interim `reports-page.tsx`.** Same reasoning as the dashboard's interim
shape (single implied property, no `/p/:propertyId` prefix yet): one page
renders all seven Tier-1 dimensions (Part 1 §1.2 — pages, referrers, UTM
source/medium, locations, devices, browsers, OS) as tabs, with the active tab
kept in a `dimension` search param (`validateReportsSearch`) so a report is
bookmarkable. Each tab is a real table header (the eventual columns) over an
honest `Empty` state — `runReport` (the single-endpoint design in the routing
section below) doesn't exist on the backend yet, so there is nothing to query.
Splits into the five dedicated pages above once that endpoint lands and the
tab list outgrows one file.

**`realtime-page.tsx`.** Built against the `analytics/realtime/*` components:
`realtime-counter`, `realtime-pulse`, `realtime-page-list`, and
`realtime-map` — all presentational per Rule R-04 — the page owns the
(currently placeholder) `count`/`pages`/`activeCountries` values and passes
them down. No realtime endpoint exists yet, so the hero counter renders `0`
and the map/pages list render their own empty states rather than a fake
"connecting…" spinner. The dashboard's own "Right now" card reuses
`RealtimeCounter` directly (not a separate mini version) and links to
`/realtime`, so the two pages don't drift into two different visual
treatments of the same concept.

**`realtime-map.tsx` — the live dot-per-active-country map.** The one
`analytics/` component with a real third-party dependency: `dotted-map`
(MIT), which renders a world map as a dot grid instead of country-boundary
paths — cheaper to compute, and visually closer to the "GA-style live map"
brief than a full choropleth would be for this view. Two things worth
recording since they aren't obvious from the code alone:

- **Precomputing the grid.** Building the dot grid from scratch needs
  `@turf/boolean-point-in-polygon` to test every candidate dot against every
  country's polygon — expensive, and identical on every load since the grid
  never changes. `scripts/generate-world-dot-map.mjs` runs that once and
  writes the result to `src/assets/world-dot-map.json` (~120 KB); the
  component loads the precomputed grid through `dotted-map/without-countries`
  instead, which skips the polygon test. That import still pulls in `proj4`
  at runtime (needed for lat/lng → grid projection when placing a pin) — it
  isn't a free import.
- **Country centroids.** Placing a pin per active country needs a
  lat/lng per ISO 3166-1 alpha-2 code (matching the `country_code char(2)`
  column, Part 3 §3.3). `src/lib/country-centroids.ts` is generated by
  `scripts/generate-country-centroids.mjs` from a public centroid dataset —
  machine-generated so the ~250 coordinate pairs are copied exactly rather
  than retyped by hand. A country code with no entry in the table is silently
  dropped from the map rather than crashing the page.
- **Lazy-loaded from the page.** `dotted-map` + `proj4` + the 120 KB grid are
  real weight that only `/realtime`'s visitors should pay for. `realtime-page.tsx`
  loads the map component via `React.lazy`/`Suspense` rather than a static
  import, so Vite puts all of it in its own chunk instead of the main bundle.
- **Pin placement reuses the library's own projection** (a throwaway
  `DottedMap` instance's `addPin`) instead of a hand-rolled equirectangular
  formula — it also snaps each pin onto the nearest land dot, which is what
  makes a pin read as part of the map rather than floating above it.

**A page's job** is to read route params and search params, call the query
hooks, handle the loading/error/empty triad, and lay out `analytics/`
components. Pages are the only place `hooks/queries/*` is called.

**Pages contain no reusable markup.** If two pages need the same block, it moves
to `components/`. This is the rule that keeps `pages/` from quietly becoming a
second component library.

### Routing

```
src/routing/
├── router.tsx              # createRouter, the assembled tree
├── route-tree.ts           # the tree definition
├── routes/
│   ├── root.route.tsx      # <Outlet/> + devtools + error boundary
│   ├── auth.route.tsx      # unauthenticated layout
│   ├── app.route.tsx       # authenticated layout — the guard lives here
│   ├── property.route.tsx  # /p/$propertyId — resolves the active property
│   ├── app-shell.route.tsx           # layout route: sidebar + header + <Outlet/>
│   ├── dashboard.route.tsx reports.route.tsx realtime.route.tsx
│   └── settings.route.tsx
├── search-validators.ts    # hand-written validators for typed search params
└── guards.ts               # beforeLoad helpers
```

**URL shape:**

```
/                                           public marketing landing page
/login                                     public
/dashboard                                 the Tier-1 overview (moves under /p/:propertyId later)
/reports?dimension=pages                   breakdown tables, tab per dimension (interim — see Pages, above)
/realtime                                  visitors in the last 30 minutes (moves under /p/:propertyId later)
/p/:propertyId                             dashboard
/p/:propertyId/reports/pages?from=…&to=…   report, state in search params
/p/:propertyId/realtime
/p/:propertyId/settings/goals
/workspaces/:workspaceId/members
```

**`/` is public** and unauthenticated visitors land there instead of being
redirected straight to `/login` — it is a sibling of `loginRoute` on
`rootRoute`, not a child of the authenticated `appRoute`. `requireAuth`
(`routing/guards.ts`) redirects to `/login`, and login's default post-auth
target is `/dashboard`, not `/`.

The property id in the path (not a search param) makes it a first-class part of
the address, so `property.route.tsx` can resolve and validate it once for every
child route.

**`search-validators.ts`** is where §7.3's argument pays off. Without Zod these
are plain functions, and the type flows from the return annotation:

```ts
// shape only
export function validateReportSearch(input: Record<string, unknown>): ReportSearch {
  return {
    from:        asIsoDate(input.from),                       // string | undefined
    to:          asIsoDate(input.to),
    preset:      asOneOf(input.preset, DATE_PRESETS, 'last_7_days'),
    granularity: asOneOf(input.granularity, GRANULARITIES, 'day'),
    compare:     asOneOf(input.compare, COMPARE_MODES, 'none'),
    dimension:   asOneOfOptional(input.dimension, DIMENSION_KEYS),
    filters:     parseFilterTree(input.filters),
    segment:     asString(input.segment),
    sort:        asString(input.sort),
  }
}
```

The primitives — `asOneOf`, `asIsoDate`, `asString` — are a handful of pure
functions in `utils/validation.ts`, shared across every route validator. They
are perhaps 40 lines total, and because `asOneOf` is generic over a `const`
tuple it preserves the literal union type, which is what makes the result
properly typed rather than `string`.

**This is the one place where dropping Zod costs something real**, and it is
worth being clear about it: `parseFilterTree` is a recursive validator for a
nested structure, and hand-writing recursive validation is exactly what schema
libraries exist to avoid. Two mitigations:

1. **Keep the filter tree shallow** — a flat `AND` list of
   `{field, operator, value}` conditions covers the Tier-1 filter UI. Nested
   boolean groups are a Tier-2 feature, and by then the cost of a schema library
   can be reassessed on its own merits.
2. **Test `parseFilterTree` exhaustively.** It is a pure function parsing
   untrusted input; it belongs in §7.15's "highest-value tests" list alongside
   `normalizeReportRequest`.

Every report page still gets validated, defaulted, fully-typed search state, and
a hand-edited URL with `granularity=fortnight` still fails cleanly at the route
boundary rather than producing a malformed API request.

### Protected routes

The guard lives on `app.route.tsx` as a `beforeLoad`, so **every** authenticated
route inherits it structurally — there is no per-route opt-in to forget:

```ts
// guards.ts — shape only
beforeLoad: ({ location, context }) => {
  if (!context.auth.isAuthenticated) {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
}
```

Three details that matter:

- **Auth state reaches the guard via router `context`**, injected when the
  router is created and updated by `AuthProvider`. Reading a Jotai atom
  directly inside `beforeLoad` would read a stale snapshot outside React's
  render cycle.
- **The `redirect` search param** returns the user where they were going after
  login. It must be validated as a relative path before use — an unvalidated
  redirect param is an open-redirect vulnerability.
- **Role gates layer on top.** `settings.route.tsx` adds a `beforeLoad`
  checking membership role, throwing to the forbidden page. Coarse gating in
  routes; fine-grained checks still enforced server-side (Part 8 §8.7) — the
  client guard is UX, never security.

---

## 7.13 `types/` and `config/`

### `types/`

> **Rule R-05.** `types/` emits zero JavaScript. Types and interfaces only. A
> `const` belongs in `config/`.

```
src/types/
├── api/                # mirrors the backend wire contract exactly
│   ├── common.ts       # ApiError, Page<T>, ResponseMeta
│   ├── auth.ts  account.ts  workspace.ts  property.ts
│   ├── goal.ts  segment.ts
│   └── report.ts       # ReportRequest, ReportResponse, ReportRow
├── domain/             # frontend-shaped models
│   ├── metric.ts  dimension.ts  filter.ts  date-range.ts
└── ui/
    ├── table.ts  chart.ts
```

**`api/` mirrors the backend; `domain/` does not have to.** The wire type for a
date range is two ISO strings; the domain type is a resolved `{from: Date, to:
Date, preset}` with timezone applied. Conflating them means either the API
types carry UI concerns or the UI carries wire concerns.

**Long term, `types/api/` should be generated from the backend's OpenAPI
schema** — FastAPI publishes one for free, and `openapi-typescript` turns it
into a `.d.ts`. Hand-written API types drift from the server the moment someone
ships a backend change without updating the frontend. Recommendation: hand-write
them for the first milestone to keep the loop tight, then switch to generation
before the API surface stabilizes. Part 11 schedules this.

**The `erasableSyntaxOnly` constraint (F-03) applies everywhere here:** closed
sets are `const` objects in `config/` plus a derived union in `types/`, never
enums.

### `config/`

```
src/config/
├── env.ts              # import.meta.env, validated at startup (hand-written)
├── constants.ts        # app-wide constants
├── routes.ts           # route path constants
├── query-config.ts     # staleTime tiers
└── analytics/
    ├── metrics.ts      # METRICS registry — the frontend half of D-03
    ├── dimensions.ts   # DIMENSIONS registry
    ├── date-presets.ts # last_7_days, last_30_days, mtd, ytd, …
    ├── granularities.ts
    └── channel-groups.ts
```

**`config/analytics/metrics.ts` is the frontend half of D-03.** Each entry
declares label, description (the tooltip), format, `higherIsBetter` (§7.10's
polarity), and whether it is approximate (driving the A-07 HLL disclosure).

**It must not drift from the backend registry.** Two options: generate it from
a backend endpoint at build time, or serve it at runtime from
`GET /api/v1/metadata/registry` and cache it. **Runtime is recommended** — it
means adding a metric is a backend-only deploy, and the frontend picks it up
without a release. The cost is one extra request on app load, cached
aggressively.

**`env.ts` validates at startup**, mirroring Part 4 §4.7's backend rule: a
missing `VITE_API_BASE_URL` should fail loudly at boot, not produce a request to
`undefined/api/v1/…` at runtime. Without Zod this is a short module-level
function that reads each `import.meta.env` key, throws on missing required
values, and exports a frozen typed object — roughly fifteen lines, and it runs
once at import time so failure is immediate.

---

## 7.14 Naming conventions

§7.1's payoff depends entirely on this being followed.

| Kind | Convention | Example |
| --- | --- | --- |
| All files | kebab-case | `metric-card.tsx`, `use-report.ts` |
| Components | PascalCase named export matching the file | `metric-card.tsx` → `MetricCard` |
| Hooks | `use-` file, `use` export | `use-report.ts` → `useReport` |
| Query hooks | `use-<noun>` | `useProperties`, `useReport` |
| Mutation hooks | `use-<verb>-<noun>` | `useCreateProperty` |
| Endpoints | verb-first function | `runReport`, `listProperties` |
| Atoms | `<name>Atom` | `themeAtom`, `accessTokenAtom` |
| Types | PascalCase, no `I` prefix | `ReportRequest` |
| Constants | SCREAMING_SNAKE | `DATE_PRESETS` |
| Pages | `<name>-page.tsx` | `dashboard-page.tsx` |
| Routes | `<name>.route.tsx` | `app.route.tsx` |

**Default exports are used only where a framework requires them.** Named
exports rename consistently, autocomplete better, and make grep reliable.
`App.tsx` and `main.tsx` keep their current shape.

---

## 7.15 Testing

| Tier | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest | `utils/`, registry lookups, `normalizeReportRequest`, formatters |
| Component | Vitest + Testing Library | `analytics/` components with fixture props |
| Integration | + MSW | A page with mocked endpoints: loading → data → error |
| Type | `tsc --noEmit` in CI | Catches drift in hand-written API types |

**MSW handlers import paths from `endpoints/paths.ts`** (§7.6) so a route rename
breaks the mock at compile time rather than producing a silently-passing test
against a URL the server no longer serves.

**The highest-value tests** are not component tests. They are the pure functions
where a bug produces *wrong numbers rather than a crash*, or where untrusted
input is parsed:

- `normalizeReportRequest` (§7.8) — cache-key correctness
- The date-preset resolver, with timezones
- The comparison-period calculator (month lengths, DST, year boundaries)
- The metric formatters and `higherIsBetter` polarity (§7.10)
- **`parseFilterTree` and the `utils/validation.ts` primitives** (§7.12) — these
  parse user-editable URL content and, without a schema library, carry the
  correctness burden a library would otherwise absorb

These are cheap to test exhaustively and expensive to get wrong.

**MSW intercepts axios transparently** — it hooks the underlying XHR and fetch
layers, so no adapter or client swap is needed between test and production.
Interceptor behaviour (401 refresh, error normalization) is therefore covered by
integration tests rather than needing to be mocked away, which is the point:
the refresh-retry flow in §7.5 is exactly the kind of logic that should be
exercised, not stubbed.

---

## 7.16 Provider composition

Part 0 F-05 noted `main.tsx` is bare. The correct nesting, and why:

```
<StrictMode>
  <ErrorBoundary>                    ← outermost: catches everything below
    <QueryClientProvider>            ← router context needs the client
      <JotaiProvider>                ← auth atoms feed the router guard
        <ThemeProvider>              ← sets .dark before first paint
          <AuthProvider>             ← bootstraps session, fills router context
            <RouterProvider />       ← innermost
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </JotaiProvider>
    </QueryClientProvider>
  </ErrorBoundary>
</StrictMode>
```

Order is not arbitrary:

- **ErrorBoundary outermost**, or a provider crash renders a white screen.
- **QueryClientProvider above RouterProvider**, because route loaders and
  `beforeLoad` guards need the query client through router context. This is the
  ordering people most often get backwards.
- **JotaiProvider above AuthProvider**, since auth state is atoms.
- **AuthProvider above RouterProvider**, so the guard in §7.12 has resolved
  auth state on first render rather than flashing the login page.

This lives in `context/providers/app-providers.tsx`, keeping `main.tsx` as the
two-line entry it currently is.

---

## 7.17 Visual design system: motion and illustration

> **Decision D-24.** Framer Motion for animation; generated inline SVG/CSS for
> illustration. No external image assets, no icon packs beyond `lucide-react`
> (already installed), no stock photography or CDN-hosted media.

The product is named **Nexlytics**. The name and mark appear only through
`components/illustrations/logo.tsx` (see below) and `index.html`'s `<title>` —
never inlined as a string literal elsewhere, so it is not scattered across
pages that will need to be found and edited individually if the name changes
again.

**Why generated illustration over image files.** An analytics product with no
design team on hand needs art that (a) never goes stale, (b) themes correctly
in light and dark without shipping two image variants, and (c) has zero
licensing or asset-pipeline overhead. Inline SVG driven by the same CSS custom
properties as everything else (`--primary`, the chart palette) satisfies all
three; a PNG hero graphic satisfies none of them.

**Where it lives:**

- `src/lib/motion.ts` — shared Framer Motion variants (`fadeUp`, `fadeIn`,
  `staggerContainer`, `scaleIn`) and transition presets. One definition per
  effect, reused across `pages/marketing`, `pages/auth`, and
  `pages/dashboard` — never inlined ad hoc per component, or the product
  accumulates a dozen slightly-different fade timings.
- `src/components/illustrations/` (§7.10) — the SVG art itself, as
  presentational components taking no props beyond `className`. They compose
  with `framer-motion`'s `motion.svg`/`motion.path` for entrance and idle
  animation (e.g. a slow path-draw on the hero chart motif, a slow drift on
  background blobs). This is also where the product wordmark lives:
  `logo.tsx` exports `LogoMark` (the gradient-filled bolt path, shared with
  `public/favicon.svg`) and `Logo` (mark + "Nexlytics" wordmark), used in the
  marketing header and the auth page's mobile-only brand link — never
  hardcoded as plain text so a future rebrand is a one-file change.

**Token additions in `index.css`.** The existing semantic tokens
(`--primary`, `--background`, …) stay untouched — shadcn `ui/` components
depend on them (R-04) and a11y contrast was tuned against them. A parallel set
of **brand accent tokens** is added for marketing/hero surfaces only:

```css
:root {
  --brand-from: oklch(0.6 0.19 280);   /* indigo */
  --brand-via:  oklch(0.65 0.2 320);   /* fuchsia */
  --brand-to:   oklch(0.75 0.17 55);   /* amber */
}
```

with a `.dark` override at slightly higher lightness for the same hues. These
back two utility classes (`bg-brand-gradient`, `text-brand-gradient`) used
only in `illustrations/`, `pages/marketing/`, and hero-adjacent surfaces of
`pages/auth/` — never inside `analytics/` dashboard widgets, where the
existing `--chart-*` palette (§7.11) already carries the meaning-bearing
color and a second unrelated gradient would compete with it.

**Motion scope and restraint.** Three tiers, deliberately not more:

1. **Entrance motion** — page and section content fades/slides in on mount
   (`fadeUp` + `staggerContainer` for card grids). Runs once, never re-triggers
   on re-render.
2. **Idle/ambient motion** — the illustration backgrounds only: slow blob
   drift, a subtle gradient shift. Reduced to a static frame under
   `prefers-reduced-motion` (Framer Motion's `useReducedMotion` hook, checked
   once in `lib/motion.ts` so every consumer inherits it for free).
3. **Interaction motion** — hover/tap scale on buttons and cards, already
   partly covered by shadcn's own transitions; Framer Motion is only layered
   on where `analytics/` and `layout/` components need something a CSS
   transition cannot express (staggered list entrance, drag, layout
   animation).

**What does not get animated:** data inside `analytics/charts/*` beyond
recharts' own built-in transitions, and anything in `components/ui/` (still
CLI-managed, R-04 — motion wraps it, never edits it).

---

## 7.18 Responsive design: desktop, tablet, mobile

> **Rule R-13.** Every screen — marketing, auth, and dashboard alike — must be
> fully usable at desktop, tablet, and mobile widths. "Usable" means no
> horizontal scroll, no clipped or overlapping controls, and no element that
> requires a pointer (hover-only menus, hover-revealed actions) to operate on
> a touch device. This is not a nice-to-have for the marketing page only; it
> applies to the authenticated dashboard just as much, since properties are
> checked from phones as often as desks.

**Breakpoints.** Tailwind v4's defaults, used as-is, no custom scale:

| Alias | Min width | Treated as |
|---|---|---|
| *(none)* | 0 | Mobile — the base, unprefixed styles |
| `sm` | 640px | Large phone / small tablet portrait |
| `md` | 768px | Tablet |
| `lg` | 1024px | Small desktop / tablet landscape |
| `xl` | 1280px | Desktop |

Base (unprefixed) styles are always the mobile layout; wider breakpoints are
additive (`sm:`, `md:`, `lg:`), consistent with the mobile-first classes
already in `login-page.tsx` (`grid-cols-1 lg:grid-cols-2`) and
`landing-page.tsx` (`md:grid-cols-2 lg:grid-cols-4`).

**What this means per surface:**

- **Dashboard (`pages/dashboard/`, future `analytics/` widgets).** The metric
  grid and any future chart grid collapse to a single column below `sm`,
  never fixed-width. The sidebar/nav shell (`layout/app-shell.tsx` +
  `layout/app-sidebar.tsx`, built on `ui/sidebar`) collapses to a
  `Sheet`-based drawer below `md` rather than a permanently docked rail —
  `ui/sidebar`'s own `useIsMobile` (`hooks/use-mobile.ts`, §7.7) drives this,
  not a bespoke breakpoint check.
- **Auth pages.** The illustration column (`AnalyticsHero`/`GridGlow`) is
  already `hidden` below `lg` — decorative panels never get their own
  breakpoint-specific redesign, they simply drop out, per the existing
  pattern in `login-page.tsx`.
- **Marketing/landing.** Hero and feature grid already reflow
  (`grid-cols-1` → `md:grid-cols-2` → `lg:grid-cols-4`); any new marketing
  section follows the same progression rather than inventing a new one.
- **Tables and wide data.** A component wider than its container (a data
  table, a wide chart) scrolls horizontally inside its own
  `overflow-x-auto` wrapper — the page itself must never scroll sideways.
- **Touch targets.** Interactive elements stay at shadcn's default sizing
  (`size-9`/`h-9` and up) or larger on touch-primary breakpoints; nothing
  interactive is shrunk below that to fit a narrow layout.

**Verification.** Before a UI change is called done, check it at three
concrete widths, not just "resize until it looks fine": 375px (phone),
768px (tablet), and 1440px (desktop) — matching the task-level instruction
to test UI changes in a real browser, not just typecheck/build.

---

## 7.19 What remains

Part 7 has fixed the frontend structure. Still open across the plan: Part 5
(ingestion), Part 6 (workers), Part 8 (auth, which §7.9 and §7.12 both defer
to), Part 9 (Alembic), Part 10 (operations), Part 11 (roadmap).
