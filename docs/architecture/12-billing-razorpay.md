# Part 12 — Billing and Subscriptions (Razorpay)

> Depends on: Part 8 (workspace = billing boundary, membership = seat).
> Feeds: Part 10 (operations), Part 11 (roadmap).

---

## 12.1 What is being billed

> **Decision D-22.** **One Razorpay subscription per workspace, priced per
> seat.** A seat is a row in `core.memberships`. Event volume is a **cap per
> tier**, not a metered charge.

```
Workspace ──1:1── Subscription ──▶ Razorpay subscription (per-seat quantity)
    │
    ├─ seats     = COUNT(core.memberships)  → subscription quantity
    ├─ tier      = free | starter | growth | scale → event cap, property cap
    └─ entitlements enforced at the point of action (§12.5)
```

**Why per-seat rather than metered events.** Per-seat revenue is predictable for
both sides, the customer can forecast their bill, and — decisively — it avoids
the operational hazard of usage-based billing on a firehose. With metered
events, a customer's bot attack or an accidental infinite redirect loop becomes
an invoice dispute. Events are capped instead: exceed the cap and ingestion
degrades gracefully (§12.8), rather than silently generating a charge.

**Why the event cap still matters.** Per-seat alone would let a one-person
workspace push 500M events/month on a ₹999 plan, and Part 1 §1.3's cost model
does not survive that. Seats price the *product*; the event cap protects the
*infrastructure*.

### Tiers

Illustrative; product sets the real numbers.

| Tier | Price / seat / month | Events / month | Properties | Retention | Notes |
| --- | --- | --- | --- | --- | --- |
| **Free** | ₹0 | 10,000 | 1 | 30 days | 1 seat only. No Razorpay subscription exists. |
| **Starter** | ₹499 | 250,000 | 3 | 90 days | |
| **Growth** | ₹1,499 | 2,000,000 | 15 | 12 months | MFA required for owner |
| **Scale** | ₹3,999 | 20,000,000 | unlimited | 25 months | API access, raw export |

**Free is genuinely free and has no subscription object.** Creating a Razorpay
subscription at ₹0 is possible but pointless — it adds a mandate authorization
step to signup, which is the worst possible place for friction. A free workspace
simply has `subscription_id IS NULL` and the entitlement resolver returns the
free tier's limits. This keeps D-19's "solo users never see the machinery" promise
intact.

### B2C and B2B in billing terms

Part 8 §8.1 established that these are not separate data models. Here is where
the distinction actually lives:

- **B2C / solo** = a workspace whose subscription quantity is 1. The Members
  screen is hidden. The upgrade prompt appears when they try to invite someone.
- **B2B / team** = quantity ≥ 2. Members and per-property permissions UI
  appear.

There is no `is_b2b` column. The seat count *is* the distinction, and the
transition is a quantity update on an existing subscription — not a migration.

---

## 12.2 Why Razorpay changes the design

Razorpay is not a drop-in Stripe. Four differences materially affect the
architecture, and designing as if it were Stripe is the main risk in this part.

### 1. Indian recurring payments require a mandate, under RBI rules

Recurring card and UPI payments in India operate under the RBI e-mandate
framework. The practical consequences:

- **The first charge requires Additional Factor Authentication (AFA)** — the
  customer completes an interactive authentication step. There is no
  "save card and charge silently later" on the first transaction.
- **Auto-debit above a threshold requires AFA on every charge.** The threshold
  has been revised upward by RBI over time (₹5,000 → ₹15,000, with further
  category-specific relaxations proposed). **Verify the current limit before
  setting prices** — a per-seat plan that crosses it for a 15-seat team turns
  every renewal into a manual authentication, which will silently destroy
  renewal rates.
- **A pre-debit notification must reach the customer ~24h before each charge.**
  Razorpay sends this for subscriptions, but it means the charge is not
  instantaneous at cycle end.

> **Action item A-10.** Before finalizing prices, verify the current RBI AFA
> threshold and model the worst-case invoice (max seats × top tier + GST)
> against it. If a plausible invoice exceeds it, either the billing cycle
> becomes annual-with-invoice or large accounts move to manually-paid invoices.
> This is a pricing constraint imposed by regulation, and discovering it after
> launch is expensive.

### 2. Subscription state is asynchronous and eventual

A Razorpay subscription passes through `created → authenticated → active`, and
can later become `pending` (a charge failed, retries scheduled), `halted`
(retries exhausted), `cancelled`, `completed`, or `paused`.

**`authenticated` is not `active`.** The mandate is approved but the first
charge has not settled. Granting entitlements on `authenticated` means granting
access before payment. Granting only on `subscription.charged` is correct but
adds a delay the user experiences as "I paid and nothing happened."

Resolution in §12.7: grant a **provisional entitlement** on `authenticated`
with a short expiry, confirmed by the first `subscription.charged` webhook.

### 3. There is no general idempotency-key header

Stripe's `Idempotency-Key` on every mutating call has no direct Razorpay
equivalent across the API surface. A create-subscription call that times out
mid-flight cannot simply be retried safely.

**Mitigation** (§12.9): we maintain our own idempotency layer — a
`billing_operations` table keyed by a client-generated operation id, written
*before* the Razorpay call, so a retry can look up whether the operation already
ran and reconcile against Razorpay's API rather than blindly re-issuing.

### 4. GST

SaaS sold in India attracts GST (18% at time of writing). This is not a Razorpay
feature — it is our obligation.

- Capture **GSTIN** for business customers (they need it for input tax credit).
- Place of supply determines CGST+SGST vs IGST split.
- Invoices must carry the required fields (our GSTIN, customer GSTIN, HSN/SAC
  code, tax breakdown).
- Exports of service (customer outside India) may be zero-rated, with
  conditions.

> **Action item A-11.** GST handling must be reviewed by a qualified
> accountant before launch. This document specifies where the data lives and
> when it is captured; it does not constitute tax advice, and the rules on
> place-of-supply for digital services are genuinely intricate.

---

## 12.3 Schema

```sql
CREATE TABLE core.subscriptions (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id           bigint NOT NULL UNIQUE
                              REFERENCES core.workspaces(id) ON DELETE CASCADE,

    tier                   text   NOT NULL DEFAULT 'free'
                              CHECK (tier IN ('free','starter','growth','scale')),

    -- Razorpay linkage (all null while on free)
    rzp_customer_id        text,
    rzp_subscription_id    text UNIQUE,
    rzp_plan_id            text,

    status                 text   NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','provisional','pending',
                                                'halted','cancelled','paused','expired')),
    quantity               int    NOT NULL DEFAULT 1,      -- seats
    current_period_start   timestamptz,
    current_period_end     timestamptz,
    provisional_until      timestamptz,                    -- §12.7
    cancel_at_period_end   boolean NOT NULL DEFAULT false,

    -- tax
    gstin                  text,
    billing_state_code     char(2),                        -- place of supply
    billing_country        char(2) NOT NULL DEFAULT 'IN',

    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.billing_events (           -- every webhook, raw
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rzp_event_id  text NOT NULL UNIQUE,      -- dedup key (§12.9)
    event_type    text NOT NULL,
    payload       jsonb NOT NULL,
    signature_ok  boolean NOT NULL,
    processed_at  timestamptz,
    error         text,
    received_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.billing_events (processed_at) WHERE processed_at IS NULL;

CREATE TABLE core.billing_operations (       -- our own idempotency (§12.9)
    operation_id   uuid PRIMARY KEY,
    workspace_id   bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    kind           text   NOT NULL,          -- 'create_subscription', 'update_quantity'
    request        jsonb  NOT NULL,
    rzp_response   jsonb,
    status         text   NOT NULL DEFAULT 'started'
                     CHECK (status IN ('started','succeeded','failed','reconciled')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    completed_at   timestamptz
);

CREATE TABLE core.invoices (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id   bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    rzp_invoice_id text UNIQUE,
    rzp_payment_id text,
    number         text NOT NULL,            -- our sequential GST invoice number
    amount_base    bigint NOT NULL,          -- paise, pre-tax
    amount_tax     bigint NOT NULL,
    amount_total   bigint NOT NULL,
    tax_breakdown  jsonb NOT NULL,           -- {cgst, sgst, igst}
    currency       char(3) NOT NULL DEFAULT 'INR',
    status         text NOT NULL,
    period_start   timestamptz,
    period_end     timestamptz,
    pdf_url        text,
    issued_at      timestamptz NOT NULL DEFAULT now()
);

-- Monthly usage, for cap enforcement (§12.8)
CREATE TABLE core.usage_counters (
    workspace_id   bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    period_month   date   NOT NULL,          -- first day of the billing month
    events_count   bigint NOT NULL DEFAULT 0,
    events_dropped bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, period_month)
);
```

**Amounts in paise as `bigint`.** Never floating point for money. Razorpay's API
works in the smallest currency unit, so this also avoids a conversion at the
boundary.

**Our own invoice numbering.** GST requires a sequential, gapless series per
financial year. Razorpay's invoice ids do not satisfy that, so we maintain
`number` ourselves from a dedicated sequence.

---

## 12.4 Backend placement

Following Part 4's layering, billing is a normal vertical slice — not a special
case:

```
app/
├── models/core/
│   ├── subscription.py  invoice.py  billing_event.py  usage_counter.py
├── schemas/
│   └── billing.py                    # request/response contracts
├── repositories/
│   ├── subscription_repo.py  invoice_repo.py
│   ├── billing_event_repo.py  usage_repo.py
├── services/
│   ├── billing_service.py            # orchestration; owns transactions
│   ├── entitlement_service.py        # "may this workspace do X?" (§12.5)
│   └── webhook_service.py            # webhook → state transition
├── billing/                          # the domain engine, like analytics/
│   ├── razorpay_client.py            # thin typed wrapper over the HTTP API
│   ├── plans.py                      # tier ↔ rzp_plan_id mapping, entitlements
│   ├── signatures.py                 # HMAC verification (§12.9)
│   ├── tax.py                        # GST computation, place-of-supply rules
│   └── reconcile.py                  # drift detection (§12.10)
├── api/v1/
│   ├── billing.py                    # authenticated: plans, subscribe, portal
│   └── webhooks.py                   # UNAUTHENTICATED, signature-verified
└── workers/
    ├── usage_rollup.py               # events → usage_counters
    ├── billing_reconcile.py          # nightly drift check
    └── dunning.py                    # failed-payment comms
```

**`billing/` is top-level for the same reason `analytics/` and `enrichment/`
are** (Part 4 §4.2): multiple consumers (the API, the webhook handler, three
workers), substantial internal structure, and no I/O of its own beyond the
Razorpay client.

**The webhook router is separate from `billing.py`** because it is
unauthenticated and must be excluded from the auth middleware — the same
reasoning that keeps the collector auth-free (Part 8 §8.5).

---

## 12.5 Entitlements — enforcement at the point of action

> **Rule R-08.** Entitlements are checked in the **service layer, at the moment
> of the action**, never only in the UI and never only at subscription time.

```python
# entitlement_service.py — shape only
@dataclass(frozen=True)
class Entitlements:
    tier: Tier
    max_seats: int
    max_properties: int
    monthly_event_cap: int
    retention_days: int
    features: frozenset[Feature]     # 'api_access', 'raw_export', 'custom_events'

async def require(self, ws: WorkspaceId, need: Entitlement) -> None
```

Enforcement points:

| Action | Check | On failure |
| --- | --- | --- |
| Invite a member | `seats_used < max_seats` | 402 + upgrade prompt |
| Create a property | `properties < max_properties` | 402 + upgrade prompt |
| Ingest an event | `events_this_month < cap` | §12.8 — degrade, do not 402 |
| Request a raw export | `'raw_export' in features` | 402 |
| Create an API key | `'api_access' in features` | 402 |
| Query beyond retention | clamp range to `retention_days` | Clamp silently, disclose in `meta` |

**Entitlements are cached in Redis (60s TTL)** alongside the permission cache
from Part 8 §8.7, invalidated on any subscription change. A billing lookup must
not add a database round trip to every request.

**The 402 responses are product surface, not errors.** Each returns a stable
`code` (`seat_limit_reached`, `property_limit_reached`) that the frontend maps
to a specific upgrade modal naming the required tier — per Part 4 §4.10's
"branch on codes, never on messages."

**Retention clamping is deliberately silent-but-disclosed.** A free-tier user
asking for 90 days gets 30 days of data plus
`meta.clamped: { requested: 90, granted: 30, reason: 'retention_limit' }`,
which the UI renders as an inline upgrade hint. Returning an error here would
make the dashboard unusable rather than merely limited.

---

## 12.6 Seat lifecycle

Seats are derived, never manually set — the count of `core.memberships` **is**
the quantity.

### Adding a seat

1. Owner/admin invites (Part 8 §8.8).
2. `entitlement_service.require(seats_used + 1 <= max_seats)`. On failure, the
   upgrade path (§12.5).
3. Invitation created. **The subscription is not yet updated** — an unaccepted
   invitation is not a seat.
4. **On acceptance**, in the same transaction that creates the membership and
   property grants: enqueue a `update_quantity` billing operation.
5. The worker calls Razorpay's update-subscription API with the new quantity.

**Proration.** Razorpay supports scheduling a change at `now` or at
`cycle_end`. Recommendation:

- **Seat increases apply at `now`**, so the customer is charged for the added
  capacity they are using.
- **Seat decreases apply at `cycle_end`**, so we do not owe a refund and the
  customer keeps what they paid for until the period ends.

This asymmetry is standard, defensible, and — importantly — must be stated
plainly in the billing UI. Quietly not refunding a removed seat is the kind of
thing that generates chargebacks.

### Removing a seat

1. Member removed (Part 8 §8.8).
2. `cancel_at_period_end`-style handling: record the pending quantity decrease;
   apply at cycle end.
3. **`max_seats` is not reduced until the change applies**, so the customer can
   re-add someone within the period without a new charge.

### The invariant

> **Rule R-09.** `subscriptions.quantity >= COUNT(memberships)` at all times.

Checked nightly by the reconciler (§12.10). A violation means someone joined
without a quantity update — a revenue leak — and pages the on-call.

---

## 12.7 Subscription lifecycle and the `authenticated` gap

The state machine, mapping Razorpay states to ours:

```
                  ┌──────────────────────────────────────────┐
   free ──────────▶  created  ──▶  authenticated  ──▶  active │
  (no rzp sub)     (checkout)     (mandate ok,      (charged) │
                                   NOT PAID)                  │
                                        │                     │
                          provisional ◀─┘                     │
                          entitlement                         │
                          (24h expiry)                        │
                                                              │
     active ──▶ pending ──▶ halted ──▶ (downgrade to free)    │
             (charge failed) (retries exhausted)              │
                                                              │
     active ──▶ cancelled (at period end) ──▶ free ◀──────────┘
```

### Subscribe flow

1. Frontend requests a subscription for a tier. Backend creates a
   `billing_operations` row, then a Razorpay customer (if none) and
   subscription with `quantity = current seat count`.
2. Backend returns `rzp_subscription_id` + the public key id.
3. Frontend opens Razorpay Checkout with that subscription id. The customer
   completes AFA / mandate authorization.
4. Checkout returns `razorpay_payment_id`, `razorpay_subscription_id`,
   `razorpay_signature`.
5. Frontend posts these to the backend, which **verifies the signature**
   (§12.9) before trusting anything.
6. Backend sets `status = 'provisional'`, `provisional_until = now() + 24h`,
   and grants the tier's entitlements immediately.
7. The `subscription.charged` webhook confirms payment → `status = 'active'`,
   `provisional_until = NULL`, period dates set from the payload.
8. If no charge confirms within 24h, a worker downgrades to free and notifies
   the owner.

**Why provisional entitlement rather than waiting.** Step 7 can lag by minutes.
A customer who has just authorized a mandate and sees no change assumes the
payment failed and either retries (creating a duplicate subscription) or
contacts support. Twenty-four hours of provisional access on an authorized
mandate is a small, bounded risk against a large, certain support cost.

**Why not grant on the client callback alone.** The signature proves the
checkout completed, but a client can be manipulated and a mandate authorization
is not a settled payment. The webhook is the authority; the callback only opens
the provisional window.

### Failed payments and dunning

`subscription.pending` means a charge failed and Razorpay will retry.

| Day | Action |
| --- | --- |
| 0 | `status = 'pending'`. Email the owner. **Full access retained.** |
| 3 | Second email. In-app banner. |
| 7 | Third email, warning of suspension. |
| 10 | `halted` → downgrade entitlements to free tier. |
| — | **Ingestion continues throughout.** Reports clamp to free retention. |

> **Decision D-23.** **Never stop ingesting events for non-payment.** Reporting
> access degrades; collection does not.
>
> Dropped events are unrecoverable (Part 1 §1.3), so suspending ingestion
> destroys the customer's data permanently over a card that expired. It also
> destroys the incentive to come back. Restricting *reports* is reversible,
> immediately felt, and recovers fully on payment. This costs us storage on
> delinquent accounts, capped by the free-tier retention window.

---

## 12.8 Event quota enforcement

Counting every event against a workspace quota synchronously would put a Redis
`INCR` plus a limit check on the 10k/sec hot path (Part 2 §2.4). The design
avoids that.

1. **Collector increments a Redis counter** per property per month — one
   `INCR`, fire-and-forget, no read, no branch. (It already touches Redis for
   dedup and session lookup, so this piggybacks on an open connection.)
2. **A worker flushes Redis counters into `core.usage_counters` every minute**,
   aggregating property → workspace.
3. **The same worker evaluates thresholds** and, on crossing 80% / 100%,
   publishes to a Redis key the collector reads from its in-process property
   cache (refreshed every 60s, per Part 2 §2.4).
4. **Over-cap behaviour is a per-property flag** the collector already has
   loaded — a dictionary lookup, not a network call.

### Over-cap behaviour

| Overage | Behaviour |
| --- | --- |
| 100–110% | Accept everything. Notify owner at 80% and 100%. |
| 110–150% | **Sample**: accept a deterministic fraction, flag `sampled: true` in report `meta` so the UI discloses it. |
| > 150% | Drop, counting into `events_dropped`. Banner: "Data collection paused — upgrade to resume." |

**Deterministic sampling**, keyed on `hash(visitor_hash) % 100 < rate` — so a
given visitor is consistently included or excluded. Random per-event sampling
would break sessionization (Part 1 §1.6) by fragmenting visitors' event streams,
producing not just fewer sessions but *wrong* ones.

**The grace band above 100% is deliberate.** A hard cutoff at exactly the cap
punishes a customer for a traffic spike on the day it matters most to them.

---

## 12.9 Webhooks — the correctness-critical path

Subscription state lives in Razorpay; our database is a replica. Webhook
handling is therefore where billing correctness is won or lost.

### Signature verification

Every webhook carries `X-Razorpay-Signature`: an HMAC-SHA256 of the **raw
request body** using the webhook secret.

> **Rule R-10.** Verify against the **raw bytes**, before any JSON parsing, using
> a constant-time comparison. Reject with 400 on mismatch, and never process an
> unverified payload.

In FastAPI this requires reading `await request.body()` rather than accepting a
parsed Pydantic model — re-serializing parsed JSON will not reproduce the exact
bytes that were signed (key order, whitespace, unicode escaping all differ), and
the signature will fail intermittently and inexplicably. This is the single most
common Razorpay integration bug.

The Checkout callback (§12.7 step 5) uses a different construction —
`HMAC_SHA256(razorpay_payment_id + "|" + razorpay_subscription_id, key_secret)`
— and is verified the same way, constant-time.

### Idempotency and ordering

**Deduplication:** `billing_events.rzp_event_id` is `UNIQUE`. Insert first; a
conflict means we have already seen this event and can 200 immediately.
Razorpay retries on non-2xx, so duplicates are normal, not exceptional.

**Out-of-order delivery is expected.** Webhooks are not ordered. A
`subscription.charged` for period N+1 can arrive before the `subscription.updated`
for period N.

> **Rule R-11.** Every state transition is guarded by a monotonic check.
> Compare the payload's timestamp against `subscriptions.updated_at` and ignore
> events older than the current state. Never apply a transition blindly.

**Handle fast, process async.** The handler verifies, dedups, inserts the raw
event, returns 200, and enqueues processing. Razorpay's timeout is short; doing
subscription reconciliation inline risks a timeout, which triggers a retry,
which arrives while the first is still running.

### Events consumed

| Event | Effect |
| --- | --- |
| `subscription.authenticated` | Mandate approved. Provisional window opens. |
| `subscription.activated` | → `active` |
| `subscription.charged` | Confirm payment, set period dates, create invoice, clear provisional |
| `subscription.pending` | Charge failed → `pending`, start dunning |
| `subscription.halted` | Retries exhausted → downgrade entitlements |
| `subscription.cancelled` | → `cancelled`, downgrade at period end |
| `subscription.paused` / `.resumed` | Suspend / restore entitlements |
| `subscription.updated` | Quantity or plan changed externally — reconcile |
| `payment.failed` | Log, feed dunning |
| `invoice.paid` | Create/settle the invoice row |

**`subscription.updated` matters more than it looks.** Changes made in the
Razorpay dashboard by a human (support issuing a discount, fixing a quantity)
arrive this way. Without handling it, our database silently diverges from
reality.

### Own-idempotency for outbound calls

Because Razorpay lacks a general idempotency-key header (§12.2):

1. Write `billing_operations` with a generated `operation_id`, status
   `started`, **before** the API call.
2. Make the call.
3. On success, record the response and mark `succeeded`.
4. **On timeout or ambiguous failure**, mark nothing. A retry finds the
   `started` row and, instead of re-issuing, **queries Razorpay** (list
   subscriptions for the customer, filtered by creation time) to determine
   whether the original call landed, then reconciles.

Without this, a timeout on create-subscription can produce two subscriptions for
one workspace and double-charge the customer.

---

## 12.10 Reconciliation

> **Rule R-12.** Nightly, compare every workspace's local subscription state
> against Razorpay's API. Alert on any divergence.

Checks:

- Local `status` matches Razorpay's.
- Local `quantity` matches Razorpay's, and both match `COUNT(memberships)`
  (R-09).
- `current_period_end` matches.
- Every `subscription.charged` in the period produced an `invoices` row.
- No `billing_operations` stuck in `started` for more than an hour.

Webhooks get lost. Deploys drop in-flight requests. Manual dashboard edits
happen. The reconciler is what makes those recoverable rather than permanent,
and billing drift discovered by a customer is far more expensive than billing
drift discovered by a cron job.

---

## 12.11 Frontend

Following Part 7's vertical-slice convention exactly:

```
types/api/billing.ts              Subscription, Invoice, Entitlements, Tier
endpoints/billing.ts              getSubscription, createSubscription,
                                  updateTier, cancel, listInvoices
hooks/queries/use-subscription.ts
hooks/queries/use-entitlements.ts
hooks/queries/use-invoices.ts
hooks/mutations/use-create-subscription.ts
hooks/mutations/use-update-tier.ts
hooks/mutations/use-cancel-subscription.ts
hooks/billing/use-entitlement.ts  # useEntitlement('seats') → {used, limit, canAdd}
context/atoms/upgrade-modal.ts    # which tier the modal is prompting for
pages/settings/billing-page.tsx
pages/settings/invoices-page.tsx
components/billing/
├── plan-card.tsx  plan-comparison.tsx
├── usage-meter.tsx               # events used / cap, with the 80% warning
├── seat-counter.tsx
├── upgrade-modal.tsx             # driven by the 402 code from §12.5
├── payment-status-banner.tsx     # dunning states
└── invoice-table.tsx             # shared/data-table
```

**Razorpay Checkout is a script, not an npm package.** It is loaded on demand —
injected when the user opens the upgrade flow, not in `index.html`. Loading a
third-party payment script on every page view is unnecessary weight and an
unnecessary third-party surface on pages that never take payment.

The Checkout script is **not on the artifact CDN allowlist model** used
elsewhere; it must be permitted explicitly in the app's Content-Security-Policy
(Part 10). Add `checkout.razorpay.com` to `script-src` and the required Razorpay
domains to `frame-src` and `connect-src`, and no others.

**The upgrade modal is driven by error codes, not by guesswork.** A 402 with
`code: 'seat_limit_reached'` sets the atom, which opens the modal pre-filled
with the cheapest tier that satisfies the need. This is the frontend half of
§12.5.

**`usage-meter.tsx` should be visible before it matters.** A meter that appears
only at 80% teaches users nothing; one that sits on the dashboard all month
makes the cap a known quantity and the upgrade a planned decision.

---

## 12.12 Testing

Billing bugs cost money in both directions and are discovered late.

| Tier | Approach |
| --- | --- |
| Unit | GST computation per place-of-supply; entitlement resolution per tier; proration arithmetic |
| Signature | Known-good and known-bad payload/signature pairs; assert raw-byte verification and constant-time comparison |
| Webhook | Replay every event type against a fixture subscription; assert idempotency (same event twice = one effect) and out-of-order safety (R-11) |
| Integration | Razorpay **test mode** (`rzp_test_` keys) end-to-end: subscribe, charge, fail, retry, cancel |
| Invariant | Property-based test: any sequence of member add/remove leaves R-09 satisfied |
| Reconciliation | Seed deliberate drift; assert the reconciler detects and reports it |

**The webhook replay suite is the highest-value tier here.** It is cheap to
build from captured fixtures and it covers the exact class of bug — duplicate
processing, out-of-order application — that is otherwise found only in
production, only intermittently, and only by a customer.

---

## 12.13 Open items

| ID | Item |
| --- | --- |
| A-10 | Verify the current RBI AFA threshold against worst-case invoice size before fixing prices |
| A-11 | Accountant review of GST treatment, place-of-supply, and invoice format |
| A-12 | Decide annual billing (usually a discount + a single larger charge — which interacts with A-10) |
| A-13 | Confirm whether international (non-INR) customers are in scope; Razorpay international acceptance needs separate activation and changes the tax model entirely |
