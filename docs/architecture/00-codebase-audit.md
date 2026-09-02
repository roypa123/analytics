# Part 0 — Codebase Audit

> **Status of this document:** Ground truth as of 2026-09-02, commit `4cb8beb`
> plus an uncommitted shadcn install (see §0.3.0).
> Everything in Parts 1–11 is constrained by what is recorded here. Where the
> project brief and the repository disagree, this document states the
> disagreement explicitly rather than papering over it.
>
> **Revision 2** — the full shadcn component set was installed mid-audit. §0.3.0
> records the delta; findings F-01 and F-04 are amended accordingly.

---

## 0.1 Why this part exists

The brief's Critical First Step is: *"study and analyze the existing frontend
and backend architecture… Do not assume that the project is starting from
scratch."*

That instruction is sound, and it produced a genuinely important result — but
not the result the brief anticipated. The honest finding is:

- The **frontend** is a real, deliberately configured Vite + React 19 +
  Tailwind v4 + shadcn application shell. Its configuration encodes several
  strong, non-default decisions that the analytics work **must** respect.
- The frontend's **`src` subfolders are empty**. `api`, `config`, `context`,
  `endpoints`, `hooks`, `pages`, `routing`, `types`, `utils` exist as
  directories and contain zero files.
- The **backend does not exist yet**. `analytics-backend/` contains a
  `.venv` and a `requirements.txt`. No source tree, no app package, no
  database layer.

So the correct posture is **not** "extend a mature codebase," and **not**
"greenfield." It is a third thing:

> **Honor the conventions the repository has already committed to, and fill in
> the structure those conventions imply.**

The empty folders are not architecture. They are *intent* — a naming
convention the author chose and has not yet populated. This plan treats that
intent as binding (we will not rename `endpoints/` to `services/`, we will not
collapse `api/` and `endpoints/` into one) while supplying the architecture
that was never written down.

---

## 0.2 Repository layout

```
e:\ROY2\analytics\
├── .claude/
│   └── CLAUDE.md                  ← the project brief
├── .git/
├── analytics-backend/
│   ├── .venv/                     ← local virtualenv (not committed)
│   └── requirements.txt           ← 17 pinned packages, UTF-16 encoded
└── analytics-frontend/
    ├── components.json            ← shadcn CLI config
    ├── eslint.config.js
    ├── index.html
    ├── package.json
    ├── public/
    │   ├── favicon.svg
    │   └── icons.svg
    ├── src/
    │   ├── api/                   ← EMPTY
    │   ├── assets/                ← hero.png, react.svg, vite.svg
    │   ├── components/
    │   │   └── ui/
    │   │       ├── button.tsx     ← shadcn, base-nova style
    │   │       └── card.tsx       ← shadcn, base-nova style
    │   ├── config/                ← EMPTY
    │   ├── context/               ← EMPTY
    │   ├── endpoints/             ← EMPTY
    │   ├── hooks/                 ← EMPTY
    │   ├── lib/
    │   │   └── utils.ts           ← the shadcn `cn()` helper, nothing else
    │   ├── pages/                 ← EMPTY
    │   ├── routing/               ← EMPTY
    │   ├── types/                 ← EMPTY
    │   ├── utils/                 ← EMPTY
    │   ├── App.css
    │   ├── App.tsx                ← "Hello world!" + one Button
    │   ├── index.css              ← Tailwind v4 theme, 131 lines
    │   └── main.tsx               ← StrictMode + createRoot, no providers
    ├── tsconfig.json              ← project references
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    └── vite.config.ts
```

**Git note.** The nine empty directories are invisible to Git — it does not
track empty directories, which is why `git status` shows only `.claude/` and
`analytics-backend/` as untracked. They exist on this working copy only. A
fresh clone would not have them.

> **Action item A-01.** Each of the nine folders needs either a real file or a
> `.gitkeep` in the first commit of the analytics work, or the convention is
> lost on the next clone. Part 7 supplies real files for all nine.

---

## 0.3 Frontend audit

### 0.3.0 Revision 2 — the full shadcn component set is now installed

After the first pass of this audit, `npx shadcn@latest add` was run across the
whole registry. The frontend now contains **61 components** in
`src/components/ui/`, plus `src/hooks/use-mobile.ts`, and eight new runtime
dependencies arrived with them.

**Components now present:**

```
accordion  alert  alert-dialog  aspect-ratio  attachment  avatar  badge
breadcrumb  bubble  button  button-group  calendar  card  carousel  chart
checkbox  collapsible  combobox  command  context-menu  dialog  direction
drawer  dropdown-menu  empty  field  hover-card  input  input-group  input-otp
item  kbd  label  marker  menubar  message  message-scroller  native-select
navigation-menu  pagination  popover  progress  questionnaire  radio-group
resizable  scroll-area  select  separator  sheet  sidebar  skeleton  slider
spinner  switch  table  tabs  textarea  toast  toggle  toggle-group  tooltip
```

**New dependencies, and what pulled them in:**

| Package | Version | Arrived with | Relevance to analytics |
| --- | --- | --- | --- |
| `recharts` | ^3.8.0 | `chart` | **The charting decision is now made** — see amended F-04 |
| `date-fns` | ^4.4.0 | `calendar` | Date-range picker + all time formatting |
| `react-day-picker` | — | `calendar` | Date-range picker |
| `cmdk` | — | `command` | Command palette / property switcher |
| `embla-carousel-react` | — | `carousel` | Not needed for analytics |
| `input-otp` | — | `input-otp` | MFA entry (Part 8) |
| `react-resizable-panels` | — | `resizable` | Dashboard layout, optional |
| `@shadcn/react` | ^0.3.1 | registry runtime | — |

**Assessment.** This is a net positive and it resolves real uncertainty. Three
consequences:

1. **Every primitive the analytics UI needs already exists**, correctly styled,
   in the correct Base UI flavour. `table`, `chart`, `calendar`, `select`,
   `combobox`, `command`, `sidebar`, `tabs`, `skeleton`, `empty`, and `tooltip`
   are precisely the Tier-1 dashboard's building blocks. Part 7 §7.10 maps each
   analytics component onto the primitives it composes.
2. **`sidebar` and `empty` and `skeleton` being present shapes the layout and
   loading-state design** — Part 7 §7.10 uses `sidebar` for the app shell rather
   than proposing a hand-rolled one, and standardizes every async surface on
   `skeleton` + `empty`.
3. **The unused components are harmless but should not be treated as free.**
   `carousel`, `bubble`, `message`, `message-scroller`, `questionnaire`,
   `attachment`, and `marker` have no role in an analytics product. They are
   tree-shaken out of the bundle since nothing imports them, so there is no
   runtime cost — but they are code in the repository that will drift, get
   flagged by lint, and confuse newcomers about what the app does.

> **Action item A-09.** Decide explicitly whether to delete the ~8 unused
> components or keep the full set. Recommendation: **keep them.** Re-adding via
> the CLI is trivial, but deleting invites someone to delete something that
> *is* used transitively (`item` and `field`, for instance, are used by other
> components). Instead, add `src/components/ui/` to the lint ignore list for
> unused-export rules, and note in the frontend README that `ui/` is
> CLI-managed vendor code, not hand-authored.
>
> **Implemented.** `eslint.config.js` carries an override for
> `src/components/ui/**` and the CLI-generated `src/hooks/use-mobile.ts`
> disabling `@typescript-eslint/no-unused-vars`,
> `react-refresh/only-export-components`, and `react-hooks/set-state-in-effect`
> — the three rules this eslint version enforces more strictly than the
> shadcn generator's target. `tsconfig.app.json`'s `noUnusedLocals` /
> `noUnusedParameters` were dropped in favor of the eslint rule specifically
> *because* eslint overrides are directory-scopable and those tsconfig flags
> are not — the same unused-import diagnostic would otherwise still fire on
> vendor files pulled transitively into the `tsc -b` program graph regardless
> of `include`/`exclude`.

Note that `use-mobile.ts` landed directly in `src/hooks/` — so that folder is no
longer empty, and its first inhabitant establishes a convention (kebab-case
filenames, named export, `use*` prefix) that Part 7 §7.7 follows rather than
overrides.

### 0.3.1 Verified state

| Question | Finding |
| --- | --- |
| Build tool | Vite 8.2.2, `@vitejs/plugin-react` 6.1.0 |
| Framework | React 19.2.8 (`react-dom` 19.2.8) |
| Language | TypeScript ~6.0.2, strict-ish (see 0.3.4) |
| Styling | Tailwind CSS 4.3.3 via `@tailwindcss/vite` — **no `tailwind.config.js`** |
| Component kit | shadcn 4.19.1 CLI, style `base-nova`, built on **`@base-ui/react` 1.7.0** |
| Icons | `lucide-react` 1.39.0 |
| Font | `@fontsource-variable/geist` 5.3.0 |
| Class utilities | `clsx`, `tailwind-merge`, `class-variance-authority` |
| Path alias | `@/*` → `./src/*`, configured in **both** `vite.config.ts` and `tsconfig.*.json` |
| Lint | ESLint 10.9.0 flat config, `typescript-eslint` 8.67, react-hooks 7.1.1 |
| Chart library | **`recharts` 3.8.0** + shadcn `chart.tsx` wrapper (rev. 2) |
| Date library | **`date-fns` 4.4.0** + `react-day-picker` (rev. 2) |
| Router | **none installed** |
| Server-state library | **none installed** |
| Client-state library | **none installed** |
| HTTP client | **none installed** |
| Form library | **none installed** |
| Test runner | **none installed** |

### 0.3.2 Finding F-01 — Jotai, TanStack Query, and a router are still missing

The brief states the frontend "uses" React, Tailwind, shadcn/ui, **Jotai**, and
**TanStack Query**. React, Tailwind, and shadcn are genuinely present and
configured — comprehensively so after revision 2. Jotai and TanStack Query are
still not in `package.json` and not imported anywhere.

The revision-2 install did **not** change this: shadcn pulls in presentation
dependencies only. State management, routing, and data fetching remain
unchosen, and they are the three decisions Part 7 must actually make.

There is also **no router at all**, despite `src/routing/` existing and the
brief asking how "routing should be organized" and how "protected routes"
integrate with "the existing routing architecture." There is no existing
routing architecture to integrate with.

This is not a problem — it just means Part 7 is *specifying* these choices
rather than *documenting* them, and the dependency additions are a real,
scheduled work item rather than a given. See Part 7 §7.2 for the full
dependency proposal and §7.3 for the router decision (React Router v7 vs.
TanStack Router), which is a genuine architectural fork that the repository has
not yet foreclosed.

### 0.3.3 Finding F-02 — shadcn here is Base UI, not Radix

`components.json` declares:

```json
{ "style": "base-nova", "iconLibrary": "lucide", "rsc": false, "tsx": true }
```

and `src/components/ui/button.tsx` imports:

```ts
import { Button as ButtonPrimitive } from "@base-ui/react/button"
```

This is the **Base UI** flavour of shadcn, not the classic Radix flavour. The
practical consequences are significant and easy to get wrong:

1. **Every component must be added through the CLI with this registry.** Running
   `npx shadcn@latest add <component>` in this project resolves against the
   `base-nova` style and emits Base UI imports. Hand-pasting a component from a
   blog post, from the classic shadcn docs, or from an LLM's memory will
   almost certainly emit `@radix-ui/react-*` imports, which will pull a second,
   parallel primitive library into the bundle and produce components whose
   focus/portal/composition behaviour differs subtly from the rest of the app.
2. **Base UI's composition API differs from Radix's.** Base UI uses a `render`
   prop where Radix uses `asChild`. Any custom compound component built on top
   of `ui/` must follow the Base UI convention.
3. **Prop types come from the primitive.** Note `ButtonPrimitive.Props &
   VariantProps<typeof buttonVariants>` — the pattern is to intersect the
   primitive's own prop type rather than extend
   `React.ButtonHTMLAttributes`. New wrappers should match.
4. **`data-slot` attributes are the styling seam.** `button.tsx` sets
   `data-slot="button"`, and its variants use selectors like
   `in-data-[slot=button-group]:rounded-lg`. Composite components coordinate
   through `data-slot`, not through class name conventions.

> **Constraint C-01 (binding).** All new UI primitives are added via
> `npx shadcn@latest add`. No hand-written or copy-pasted `ui/` components. No
> `@radix-ui/*` package may enter `package.json`.

### 0.3.4 Finding F-03 — the TypeScript config bans two common patterns

`tsconfig.app.json` enables:

```jsonc
"verbatimModuleSyntax": true,   // type-only imports must say `import type`
"erasableSyntaxOnly": true,     // no enums, no parameter properties, no namespaces
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
"allowImportingTsExtensions": true,
"moduleResolution": "bundler"
```

Two of these shape the code style of everything Part 7 proposes:

- **`erasableSyntaxOnly`** forbids TypeScript `enum`. An analytics app has many
  closed sets — metric names, dimension names, date-range presets, event types,
  member roles. Every one of them must be modelled as a `const` object plus a
  derived union type:

  ```ts
  export const METRIC = { Sessions: 'sessions', Users: 'users' } as const
  export type Metric = (typeof METRIC)[keyof typeof METRIC]
  ```

  This is the better pattern anyway (tree-shakeable, no runtime enum object,
  serializes cleanly to query strings), but it must be applied consistently
  from the first file or the codebase will end up with two idioms.

- **`verbatimModuleSyntax`** means every type-only import needs the `type`
  keyword. Mixed imports must be split or inline-annotated
  (`import { type Foo, bar } from '...'`). Note `src/lib/utils.ts` already does
  this: `import { clsx, type ClassValue } from "clsx"`.

Also worth noting: **`strict` is not set** in `tsconfig.app.json`. The compiler
options present are mostly lint-adjacent. This is likely an oversight in the
Vite template's evolution.

> **Action item A-02.** Turn on `"strict": true` before writing application
> code. Doing it now costs nothing; doing it after the analytics query layer
> exists is a multi-day retrofit. Analytics code is full of nullable
> aggregates (`AVG()` over an empty window is `NULL`) and strict null checks
> are precisely what catches those.

### 0.3.5 Finding F-04 — Tailwind v4 is CSS-first, and the chart palette is unusable

The theme lives entirely in `src/index.css` in an `@theme inline` block.
`components.json` correctly reflects this with `"tailwind": { "config": "" }`.
There is no JS config file and **none should be created** — v4's CSS-first
configuration is the supported path, and adding a JS config would split the
source of truth.

The token set is complete and conventional: `--background`, `--foreground`,
`--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`,
`--destructive`, `--border`, `--input`, `--ring`, a full `--sidebar-*` family,
a `--radius` scale derived by multiplication, and `--chart-1` … `--chart-5`.
Dark mode is a `.dark` class variant (`@custom-variant dark (&:is(.dark *))`),
so a theme provider toggling a class on `<html>` is the expected mechanism.

**But the chart tokens are pure greyscale.** In both light and dark blocks:

```css
--chart-1: oklch(0.87 0 0);   /* chroma = 0 */
--chart-2: oklch(0.556 0 0);
--chart-3: oklch(0.439 0 0);
--chart-4: oklch(0.371 0 0);
--chart-5: oklch(0.269 0 0);
```

Every chart colour has zero chroma — they are five shades of grey, and
`--chart-1` … `--chart-5` are **identical in light and dark mode**, meaning
`--chart-1` (0.87 lightness, near-white) is invisible on a light background and
`--chart-5` (0.269, near-black) is invisible on a dark one.

For a monochrome marketing site this is a defensible aesthetic. For an
analytics product it is a blocker: the core UI is multi-series time series,
stacked bars, and category breakdowns where colour *is* the encoding.

> **Action item A-03.** Design a real categorical palette before building any
> chart. Requirements: 5–8 hues, distinguishable at 2px line weight and at
> 8px legend-swatch size, distinguishable under deuteranopia and protanopia,
> and defined **separately for light and dark** so lightness contrast against
> the ground is maintained in both. Plus a sequential ramp (for
> geo/choropleth and heatmap-of-hour-vs-weekday) and a diverging ramp (for
> period-over-period deltas). Part 7 §7.11 specifies this.

**Amendment (rev. 2).** The installed `chart.tsx` supplies the *mechanism* for
fixing this, which materially reduces the work. Its `ChartConfig` type accepts
either a single `color` or a per-theme map:

```ts
| { color?: string; theme?: never }
| { color?: never; theme: Record<"light" | "dark", string> }
```

and `THEMES = { light: "", dark: ".dark" }` matches the `.dark` class variant
already in `index.css`. So the wiring from token to series colour exists and is
theme-aware out of the box.

**A-03 is therefore reduced from "build a theming mechanism" to "choose eight
oklch values per theme and write them into `index.css`."** The greyscale
`--chart-1..5` defaults remain unusable and remain a blocker for the first
chart — but it is now a half-day design task, not an engineering one. Part 7
§7.11 gives the required properties and the validation procedure.

### 0.3.6 Finding F-05 — no application shell exists

`src/main.tsx` is the bare Vite template: `createRoot` → `StrictMode` → `App`.
There is no `QueryClientProvider`, no Jotai `Provider`, no router, no theme
provider, no error boundary, no auth provider.

`src/App.tsx` is a heading and a button with an `alert()`.

This is genuinely useful information: **the provider composition is unclaimed**,
so Part 7 can specify the correct nesting order from scratch without unwinding
a wrong one. (Order matters: error boundary outside router, router outside
query client is a common mistake — see Part 7 §7.5.)

### 0.3.7 Finding F-06 — `src/utils/` and `src/lib/` overlap

The repository has both. `src/lib/utils.ts` exists and holds `cn()`, and
`components.json` pins the shadcn `utils` alias to `@/lib/utils` — so `lib/` is
**owned by the shadcn convention and cannot be renamed or removed**. `src/utils/`
is empty.

Left undefined, these two will accumulate arbitrary overlapping helpers. Part 7
§7.4 assigns them non-overlapping charters:

- **`lib/`** — third-party integration seams and framework wiring. Things that
  configure or adapt an external library. Owned partly by the shadcn CLI.
- **`utils/`** — pure, dependency-free, unit-testable functions. No React, no
  imports from `api/`, `endpoints/`, or `config/`.

The same discipline is applied to the `api/` vs. `endpoints/` pair, which is
the other ambiguous adjacency in the folder list.

### 0.3.8 Dependency-risk note

The stack is on the *leading* edge across the board: React 19.2, TypeScript 6.0,
Vite 8, ESLint 10, Tailwind 4.3, Base UI 1.7. This is a coherent and modern
choice, but it narrows the ecosystem:

- Some chart libraries have not yet shipped React 19 peer ranges. This directly
  affects the Part 7 §7.11 charting decision and is the reason that section
  recommends verifying peer deps before committing rather than naming a library
  on reputation.
- ESLint 10 flat config is not accepted by every plugin.
- TypeScript 6.0 removed several long-deprecated options; older `@types`
  packages can fail to compile.

> **Action item A-04.** Add a CI job that runs `npm ci && npm run build` on a
> clean checkout from day one. On a stack this new, "works on my machine with a
> warm `node_modules`" and "builds from lockfile" diverge often.

---

## 0.4 Backend audit

### 0.4.1 Verified state

`analytics-backend/` contains exactly two entries: `.venv/` and
`requirements.txt`. There is no Python package, no `main.py`, no `app/`, no
`alembic.ini`, no `Dockerfile`, no `pyproject.toml`, no `.env.example`, no
tests.

`requirements.txt` pins 17 packages:

```
annotated-doc==0.0.5        anyio==4.14.2         click==8.5.0
fastapi==0.141.1            h11==0.16.0           httptools==0.8.0
idna==3.19                  pydantic==2.13.5      pydantic_core==2.46.5
python-dotenv==1.2.3        PyYAML==6.0.3         starlette==1.6.0
typing-inspection==0.4.4    typing_extensions==4.16.0
uvicorn==0.52.4             watchfiles==1.2.0     websockets==17.1
```

This is precisely `pip install "fastapi[standard]" python-dotenv` and nothing
more — the transitive closure of FastAPI plus dotenv. It tells us the intended
framework and that configuration is meant to come from `.env`, and nothing else.

### 0.4.2 Finding F-07 — the entire data layer is absent from requirements

For a plan that specifies PostgreSQL, Alembic, and background workers, the
following are all missing:

| Concern | Missing package |
| --- | --- |
| ORM / query builder | `sqlalchemy` |
| Migrations | `alembic` |
| Postgres driver (async) | `asyncpg` |
| Postgres driver (sync, for Alembic + workers) | `psycopg[binary]` |
| Password hashing | `argon2-cffi` or `passlib[bcrypt]` |
| JWT | `pyjwt` or `python-jose` |
| Cache / queue broker | `redis` |
| Task queue | `arq` or `celery` |
| Settings management | `pydantic-settings` |
| Testing | `pytest`, `pytest-asyncio`, `httpx` |
| Migration testing | `testcontainers` (recommended) |

Part 4 §4.3 gives the full proposed dependency set with a justification per
package, and Part 4 §4.4 argues for moving from `requirements.txt` to
`pyproject.toml` + `uv` — which is a real decision with tradeoffs, not a
foregone conclusion.

Note that `pydantic-settings` in particular is absent while `python-dotenv` is
present, which suggests the intent was to read `.env` manually via
`os.environ`. Part 4 §4.7 argues for typed settings objects instead; on a
system with this many tunable knobs (retention windows, sampling thresholds,
rollup intervals, rate limits) untyped `os.environ` access becomes a
reliability problem.

### 0.4.3 Finding F-08 — `requirements.txt` is UTF-16 encoded

Reading the file byte-wise shows a UTF-16 LE BOM (`0xFF 0xFE`) followed by
null-interleaved ASCII. This is the signature of

```powershell
pip freeze > requirements.txt
```

in Windows PowerShell 5.1, whose default redirection encoding is UTF-16 LE.

`pip install -r requirements.txt` will fail to parse this on Linux and in most
Docker builds. It happens to work locally only if pip's encoding detection
catches the BOM.

> **Action item A-05.** Rewrite as UTF-8 (no BOM). In PowerShell:
> `pip freeze | Out-File -Encoding utf8 requirements.txt` — or better, adopt
> `pyproject.toml` per Part 4 §4.4 and delete the file. This will bite in CI
> on the first containerized build, and the error message (`Invalid
> requirement: '\xff\xfea...'`) is not obviously an encoding problem.

### 0.4.4 What the absence of a backend means for this plan

There is no existing API surface, no existing route naming, no existing schema
convention, no existing error envelope, no existing auth scheme, and no existing
migration history to be compatible with.

The brief asks the plan to "fit into and extend the current application
architecture." For the backend, honestly stated: **there is nothing to fit into
yet**, so Part 4 is a full specification rather than an extension. The
compensating discipline is that the backend must be designed *around* the
frontend conventions that do exist — the `endpoints/` + `api/` split, the
`@/types` organization, and the response shapes TanStack Query will consume.
Part 4 §4.10 works backwards from the frontend contract for exactly this
reason.

---

## 0.5 Consolidated findings and actions

### Findings

| ID | Finding | Impact |
| --- | --- | --- |
| F-01 | Jotai, TanStack Query, and a router are all uninstalled | Part 7 specifies rather than documents; deps are scheduled work |
| F-02 | shadcn is the Base UI (`base-nova`) flavour, not Radix | Binding constraint on how every UI component is added |
| F-03 | `erasableSyntaxOnly` bans enums; `verbatimModuleSyntax` requires `import type` | Shapes the idiom for every closed set in the domain |
| F-04 | `--chart-1..5` are greyscale and identical across themes | Charting is blocked until a palette is designed |
| F-05 | No provider composition exists in `main.tsx` | Free hand to specify correct nesting |
| F-06 | `lib/` and `utils/` overlap with no charter | Needs an explicit boundary before either fills up |
| F-07 | No ORM, driver, migration tool, auth, or queue in requirements | The data layer is entirely unspecified work |
| F-08 | `requirements.txt` is UTF-16 | Will break Linux/Docker installs |

### Actions

| ID | Action | When | Owner layer |
| --- | --- | --- | --- |
| A-01 | Commit real files (or `.gitkeep`) into the nine empty folders | First analytics commit | Frontend |
| A-02 | Enable `"strict": true` in `tsconfig.app.json` | Before any feature code | Frontend |
| A-03 | Design light/dark categorical + sequential + diverging chart palettes | Before the first chart | Design |
| A-04 | CI job: clean `npm ci && npm run build` | First analytics commit | Infra |
| A-05 | Re-encode `requirements.txt` as UTF-8, or migrate to `pyproject.toml` | Before first container build | Backend |

---

## 0.6 How the rest of this plan is organized

| Part | Document | Covers |
| --- | --- | --- |
| 0 | `00-codebase-audit.md` | *This document* — ground truth |
| 1 | `01-product-scope-and-domain.md` | What we are building; domain model; the metric definitions that everything downstream depends on |
| 2 | `02-system-architecture.md` | End-to-end topology: collect → ingest → process → store → query → visualize |
| 3 | `03-database-architecture.md` | PostgreSQL schema, partitioning, rollups, indexing, retention |
| 4 | `04-backend-architecture.md` | FastAPI layering; where each responsibility lives |
| 5 | `05-ingestion-pipeline.md` | Tracking script, collector endpoint, validation, enrichment, bot filtering |
| 6 | `06-background-processing.md` | Workers, aggregation jobs, scheduling, idempotency, backfill |
| 7 | `07-frontend-architecture.md` | The nine folders, state split, query design, components, routing |
| 8 | `08-auth-and-tenancy.md` | Accounts, workspaces, properties, sessions, RBAC, API keys |
| 9 | `09-migrations-alembic.md` | Alembic workflow across dev/staging/prod; rollback; partition-aware migrations |
| 10 | `10-operations.md` | Observability, performance budgets, security, cost, capacity |
| 11 | `11-roadmap.md` | Phased delivery with exit criteria |

Cross-references use the form *Part N §N.M*.
