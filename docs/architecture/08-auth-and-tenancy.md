# Part 8 — Authentication, Tenancy, and Access Control

> Depends on: Part 3 §3.2 (core schema), Part 4 §4.14 (layer placement),
> Part 7 §7.9/§7.12 (token storage, route guards — both deferred to here).
> Feeds: Part 12 (billing attaches to the workspace defined here).

---

## 8.1 Product shape: one model, two go-to-market motions

The product serves two customer types:

- **B2C / solo** — one person signs up, tracks their own sites, has full access
  to everything they own. No teammates, no invitations, no permission UI.
- **B2B / team** — an organization with several members, where **each member is
  granted access to specific properties**, and their role on each property
  determines what they can do there.

> **Decision D-19.** These are **not two data models.** They are the same
> tenancy model at different seat counts. A solo account is a workspace with
> exactly one member who holds `owner` on every property in it.

**Why this matters more than it sounds.** The tempting alternative — a
"personal account" type distinct from an "organization" type — is a trap that
GitHub, GitLab, and Vercel have all had to unwind at enormous cost. It produces
two code paths for every authorization check, two billing paths, and an
"upgrade personal to team" migration that is painful precisely because the two
object graphs differ.

With one model, the B2C→B2B upgrade is: *invite a second member*. No migration,
no data movement, no second code path. The tiers differ only in what the plan
**entitles** (seat count, property count, event quota) and what UI is shown —
solo workspaces simply hide the members and permissions screens until a second
seat is purchased.

The B2C/B2B distinction therefore lives in **Part 12 (billing entitlements)**
and in **UI affordances**, not in the schema.

---

## 8.2 The tenancy hierarchy

```
Account                        a human who logs in
   │
   │  Membership (workspace_id, account_id, workspace_role)
   │      workspace_role ∈ { owner, admin, member }
   │      → governs BILLING and WORKSPACE ADMINISTRATION
   ▼
Workspace                      tenancy + billing boundary
   │
   │  owns
   ▼
Property                       one tracked website
   ▲
   │  PropertyAccess (property_id, account_id, property_role)
   │      property_role ∈ { admin, analyst, viewer }
   │      → governs WHAT YOU CAN DO WITH THIS SITE'S DATA
   │
Account ───────────────────────┘
```

### Two role dimensions, deliberately

This is the core of the design and it directly answers "some persons can see
some parts."

| Dimension | Scope | Answers |
| --- | --- | --- |
| **`workspace_role`** | The whole workspace | *Can you manage billing, invite people, create properties?* |
| **`property_role`** | One specific property | *Can you see this site's data, and can you change its settings?* |

A member with `workspace_role = member` and `PropertyAccess` on only
`site1.com` sees exactly one property in their sidebar. `site2.com` does not
exist as far as their session is concerned — not greyed out, **not returned by
the API at all**.

**Precedent.** This is how Google Analytics itself works: account-level
permissions and property-level permissions are separate grants. It is also
Vercel's team/project model and AWS's account/resource model. The pattern is
well-trodden because the alternative — a single flat role per user per
workspace — cannot express "this contractor sees one client's site."

### Why not put the role only on the property grant

Considered: drop `workspace_role` entirely, derive everything from property
grants. Rejected because some capabilities are genuinely workspace-scoped and
belong to nobody in particular otherwise — who pays the bill, who can create a
*new* property (which by definition has no grants yet), who can remove a
member. Those need a workspace-level answer.

### Why not put the role only on the membership

Also considered: one `workspace_role`, applied uniformly to all properties.
This is simpler and it is what most small SaaS products ship first. Rejected
because it cannot express the requirement — per-property access is the stated
need, and retrofitting it later means touching every authorization check and
every query in the system.

---

## 8.3 Schema

Amends Part 3 §3.2.

```sql
CREATE TABLE core.memberships (
    workspace_id    bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    account_id      bigint NOT NULL REFERENCES core.accounts(id)   ON DELETE CASCADE,
    workspace_role  text   NOT NULL
        CHECK (workspace_role IN ('owner','admin','member')),
    invited_by      bigint REFERENCES core.accounts(id),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, account_id)
);
CREATE INDEX ON core.memberships (account_id);

CREATE TABLE core.property_access (
    property_id     bigint NOT NULL REFERENCES core.properties(id) ON DELETE CASCADE,
    account_id      bigint NOT NULL REFERENCES core.accounts(id)   ON DELETE CASCADE,
    property_role   text   NOT NULL
        CHECK (property_role IN ('admin','analyst','viewer')),
    granted_by      bigint REFERENCES core.accounts(id),
    granted_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (property_id, account_id)
);
CREATE INDEX ON core.property_access (account_id);

-- Invitations: a pending membership for an email that may not have an account yet.
CREATE TABLE core.invitations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id    bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    email           citext NOT NULL,
    workspace_role  text   NOT NULL,
    -- properties + roles to grant on acceptance
    property_grants jsonb  NOT NULL DEFAULT '[]',
    token_hash      bytea  NOT NULL,          -- never store the raw token
    invited_by      bigint NOT NULL REFERENCES core.accounts(id),
    expires_at      timestamptz NOT NULL,
    accepted_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, email) WHERE accepted_at IS NULL
);
```

Two notes:

**`property_grants` as `jsonb` on the invitation.** The grants cannot be rows in
`property_access` yet because the account may not exist. Storing the intended
grants and materializing them on acceptance keeps the invitation self-contained
and lets the inviter configure access before the person has signed up.

**`token_hash`, not `token`.** An invitation token is a bearer credential. A
database read (a backup, a support query, a leaked dump) must not yield a usable
token. Store `sha256(token)`; compare on lookup. Same rule applies to password
reset tokens and API keys (§8.9).

### The owner invariant

> **Rule R-06.** Every workspace has at least one `owner` at all times.

Enforced in the service layer on every membership delete and role change:
demoting or removing the last owner raises `LastOwnerError`. This cannot be a
`CHECK` constraint (it spans rows), and a trigger would be invisible to
developers reading the service. It needs a test.

---

## 8.4 Authentication

### Token strategy

> **Decision D-20.** **Short-lived access token in memory + long-lived refresh
> token in an httpOnly cookie.** Access tokens are JWTs; refresh tokens are
> opaque, stored server-side, and rotated on every use.

| | Access token | Refresh token |
| --- | --- | --- |
| Format | JWT (EdDSA / Ed25519) | Opaque 32-byte random |
| Lifetime | 15 minutes | 30 days, sliding |
| Storage (client) | **JS memory only** — Jotai atom, not persisted | `httpOnly; Secure; SameSite=Lax` cookie |
| Storage (server) | none (stateless) | hashed row in `core.refresh_tokens` |
| Revocable | No (short life covers it) | Yes, immediately |

**Why not localStorage for the access token.** Part 7 §7.9 stated this and here
is the reasoning: any XSS on the dashboard can read `localStorage` and exfiltrate
a long-lived credential. An in-memory token dies with the tab, and XSS that can
read memory can already act as the user anyway — the attacker gains nothing
persistent. This is why `accessTokenAtom` is a plain Jotai atom and explicitly
**not** `atomWithStorage`.

**Why the refresh token is opaque, not a JWT.** JWTs cannot be revoked without a
denylist, which defeats their statelessness. Since refresh tokens must be
revocable (logout, password change, "sign out all devices," a detected theft),
they are server-side rows. There is no benefit to making them self-describing.

**Why refresh rotation.** Every refresh issues a new refresh token and
invalidates the old one. If an old token is ever presented again, that means
either a replay or a stolen token being used in parallel — the server then
**revokes the entire token family** and forces re-authentication. This is
detection, not just prevention, and it is cheap.

```sql
CREATE TABLE core.refresh_tokens (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id   bigint NOT NULL REFERENCES core.accounts(id) ON DELETE CASCADE,
    family_id    uuid   NOT NULL,        -- rotation chain; revoked as a unit
    token_hash   bytea  NOT NULL UNIQUE,
    user_agent   text,
    ip_hash      bytea,                  -- hashed, per Part 1 §1.7 principles
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz,
    used_at      timestamptz,            -- non-null + presented again = replay
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.refresh_tokens (account_id) WHERE revoked_at IS NULL;
```

**Why EdDSA over HS256.** Asymmetric signing means the API service holds only
the public key and cannot mint tokens. Only the auth service holds the private
key. It also makes key rotation tractable — publish a JWKS with two keys during
the overlap window. Ed25519 signatures are small and fast to verify, which
matters when every request verifies one.

### Access token claims

```jsonc
{
  "sub": "12345",              // account id
  "sid": "01JQ...",            // session/family id, for correlation
  "iat": …, "exp": …,
  "jti": "…"
}
```

**Deliberately minimal.** No roles, no workspace list, no property grants in the
token.

This is a real decision with a real cost. Embedding permissions would avoid a
database lookup per request. But permissions change — a member's property access
is revoked, someone is removed from a workspace — and a token minted before that
change would remain valid for its full lifetime. For an access token that is 15
minutes of stale authorization on data the customer considers confidential.

> **Decision D-21.** Permissions are resolved per request from the database,
> not carried in the token. Mitigated by caching the resolved permission set in
> Redis for 60 seconds, keyed by account id and invalidated explicitly on any
> grant change — so the common case is one Redis `GET`, and revocation is
> effective within a second.

### Password handling

Argon2id per Part 4 §4.8 (D-15). Additionally:

- **Minimum 12 characters**, no composition rules. Length beats character-class
  requirements, which mainly produce `Password1!`.
- **Breach check** against a k-anonymity range API (HIBP-style) on registration
  and password change. Reject known-breached passwords.
- **Timing-safe failure.** A login attempt for a non-existent email must take
  the same time as one for an existing email with a wrong password — otherwise
  the endpoint is an account-enumeration oracle. Hash a dummy value on the
  not-found path.
- **Generic error messages.** "Invalid email or password," never "no account
  with that email."
- **Password change revokes all refresh token families** except the current one.

### MFA

TOTP, using the `input-otp` component already installed (Part 0 §0.3.0).

- Secret encrypted at rest with an application-level key (not just disk
  encryption).
- 10 single-use recovery codes, hashed like passwords, shown once.
- MFA verification happens **after** password verification, before tokens are
  issued, using a short-lived (5 min) single-purpose `mfa_pending` token so the
  password is not re-sent.
- **Required for `owner` role on paid workspaces** — the account that controls
  billing is the highest-value target.

### Rate limiting

| Endpoint | Limit |
| --- | --- |
| `POST /auth/login` | 5 / 15 min per (IP, email) — both, not either |
| `POST /auth/register` | 3 / hour per IP |
| `POST /auth/forgot-password` | 3 / hour per email, 10 / hour per IP |
| `POST /auth/refresh` | 60 / hour per account |
| `POST /auth/mfa/verify` | 5 / 15 min per pending token |

Keying login on **(IP, email) as a pair plus each separately** matters:
per-IP-only lets a botnet spray one password across many accounts; per-email-only
lets one attacker rotate IPs. Both are needed.

---

## 8.5 Sessions across the two apps

The collector (Part 2 §2.3) is **entirely unauthenticated** and never sees a
session. It must not import the auth module. This is worth stating explicitly
because it is a natural-seeming mistake: adding auth middleware globally would
put a database lookup on the 10k-events/sec hot path.

Only the API service authenticates.

---

## 8.6 The permission matrix

### Workspace-scoped capabilities

| Capability | owner | admin | member |
| --- | :-: | :-: | :-: |
| View workspace | ✅ | ✅ | ✅ |
| Rename workspace | ✅ | ✅ | ❌ |
| Delete workspace | ✅ | ❌ | ❌ |
| Create property | ✅ | ✅ | ❌ |
| Delete property | ✅ | ✅ | ❌ |
| Invite member | ✅ | ✅ | ❌ |
| Remove member | ✅ | ✅ | ❌ |
| Change member's workspace role | ✅ | ❌ | ❌ |
| Grant/revoke property access | ✅ | ✅ | ❌ |
| **Manage billing & subscription** | ✅ | ❌ | ❌ |
| **View invoices** | ✅ | ✅ | ❌ |
| Manage workspace API keys | ✅ | ✅ | ❌ |
| View audit log | ✅ | ✅ | ❌ |

### Property-scoped capabilities

| Capability | admin | analyst | viewer |
| --- | :-: | :-: | :-: |
| View reports | ✅ | ✅ | ✅ |
| View realtime | ✅ | ✅ | ✅ |
| Export report data | ✅ | ✅ | ❌ |
| Create/edit segments | ✅ | ✅ | ❌ |
| Create/edit goals | ✅ | ✅ | ❌ |
| Edit property settings (timezone, filters) | ✅ | ❌ | ❌ |
| View tracking snippet | ✅ | ✅ | ❌ |
| Manage property API keys | ✅ | ❌ | ❌ |
| Reset/purge property data | ✅ | ❌ | ❌ |

### Composition rules

1. **`workspace_role = owner` or `admin` implies `property_role = admin` on
   every property in the workspace.** Workspace admins do not need explicit
   grants — they administer the whole workspace by definition. Requiring
   grants for them would mean a new property is invisible to its own creator.
2. **`workspace_role = member` has access to exactly the properties granted**
   in `property_access`, and no others.
3. **No grant = no existence.** A property a member cannot access is absent
   from list endpoints, not returned as forbidden. Returning 403 for a specific
   property id confirms it exists, which leaks the customer's site inventory.
4. **Effective role = the property grant**, except as elevated by rule 1.

### Where these live in code

The matrix is a **single declarative table in `core/permissions.py`**, not
scattered `if role == 'admin'` checks:

```python
# shape only
Capability = Literal['property.reports.view', 'property.goals.edit', …]

WORKSPACE_CAPABILITIES: Mapping[WorkspaceRole, frozenset[Capability]] = {…}
PROPERTY_CAPABILITIES:  Mapping[PropertyRole,  frozenset[Capability]] = {…}

def can(ctx: AuthContext, cap: Capability, property_id: PropertyId | None) -> bool
```

**Mirrored on the frontend** for UI affordances only, from the same source
served at `GET /api/v1/metadata/permissions` — the same runtime-registry
pattern as the metric registry (Part 7 §7.13). The client copy hides buttons;
it is never the enforcement point.

---

## 8.7 Enforcement — making tenancy structurally unforgettable

Part 4 §4.14 called this the single most important security decision in the
backend. The mechanism, in full.

### The `AuthContext`

Resolved once per request by a dependency, cached in Redis for 60s (D-21):

```python
@dataclass(frozen=True)
class AuthContext:
    account_id: AccountId
    workspace_id: WorkspaceId
    workspace_role: WorkspaceRole
    accessible_properties: Mapping[PropertyId, PropertyRole]   # fully resolved
```

`accessible_properties` already has rule 1 applied — a workspace admin's map
contains every property at `admin`. Downstream code never re-derives it.

### Three enforcement layers

**Layer 1 — route dependency (coarse).**

```python
Depends(require_workspace_capability('workspace.member.invite'))
Depends(require_property_capability('property.goals.edit'))
```

The property variant reads `property_id` from the path, looks it up in
`accessible_properties`, and raises `NotFoundError` (not `AuthorizationError`)
if absent — per composition rule 3.

**Layer 2 — the query compiler (structural).**

The report compiler (Part 4 §4.9) **cannot build a query without an
`AuthContext`**, and it unconditionally injects:

```sql
WHERE property_id = ANY(:accessible_property_ids)
```

This is the load-bearing control. It is not a check a developer performs — it
is a parameter the compiler requires in order to produce SQL at all. A new
report endpoint written by someone who has never read this document is still
scoped correctly, because the alternative does not compile.

**Layer 3 — repository assertions (defence in depth).**

Repository methods touching tenant data take an explicit `property_id` or
`workspace_id` and assert it is present in the context. Cheap, and it catches
the case where someone bypasses the compiler with a hand-written query.

### Testing it

> **Rule R-07.** Every tenant-scoped endpoint has a test proving that account B
> cannot read account A's data.

Implemented as a parameterized test that enumerates the router's routes and,
for each, asserts a cross-tenant request returns 404. **A new endpoint without
this coverage fails CI** — the test discovers routes by introspection, so
forgetting to add a case is not possible; you can only fail it.

This is the difference between "we check authorization" and "we cannot ship an
endpoint that doesn't."

---

## 8.8 Invitation and onboarding flows

### Solo signup (B2C)

1. Register → email verification.
2. **A workspace is auto-created** (`"<Name>'s Workspace"`, plan `free`) with
   the account as `owner`. The user never sees the word "workspace" in this
   flow.
3. Create first property → tracking snippet → install verification.
4. The members and permissions UI is **hidden** while the workspace has one
   seat and the plan has no seat entitlement (Part 12).

The user experiences a single-player product. The multi-tenant model is present
but invisible — which is exactly D-19's point.

### Adding a teammate (B2C → B2B)

1. Owner opens Members, clicks Invite. If the plan has no spare seat, this is
   the **upgrade prompt** — the natural monetization moment (Part 12 §12.5).
2. Enter email, choose `workspace_role`, select which properties and what
   `property_role` on each.
3. `core.invitations` row created with `property_grants`; email sent with a
   single-use token.
4. Acceptance: if the email has an account, log in and accept; otherwise
   register first. On acceptance, in **one transaction**: create the
   `memberships` row, materialize every `property_access` row from
   `property_grants`, mark the invitation accepted, and bump the seat count on
   the subscription (Part 12 §12.6).

### Invitation security

- Token: 32 bytes of CSPRNG output, stored hashed (§8.3).
- Expires in 7 days; single use.
- **Bound to the invited email.** Accepting while logged in as a different
  account is refused — otherwise a forwarded invite grants access to the wrong
  person.
- Re-inviting replaces the pending row (the partial unique index enforces one
  pending invite per email per workspace).
- Revocable before acceptance.

### Leaving and removal

- Removing a member deletes the membership **and cascades all
  `property_access` rows** — `ON DELETE CASCADE` from `accounts` handles account
  deletion, but workspace removal needs an explicit delete of that workspace's
  property grants only, since the account may belong to other workspaces.
- All refresh token families for that account are **not** revoked (they may
  have other workspaces), but their permission cache is invalidated immediately.
- The last owner cannot leave (R-06).
- Seat count decrements on the subscription (Part 12 §12.6).

---

## 8.9 API keys

For programmatic report access and server-side ingestion (Part 1 §1.2, Tier 3).

```sql
CREATE TABLE core.api_keys (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id  bigint NOT NULL REFERENCES core.workspaces(id) ON DELETE CASCADE,
    property_id   bigint REFERENCES core.properties(id) ON DELETE CASCADE,  -- null = workspace-wide
    name          text   NOT NULL,
    key_prefix    text   NOT NULL,          -- first 8 chars, shown in the UI
    key_hash      bytea  NOT NULL UNIQUE,
    scopes        text[] NOT NULL,
    created_by    bigint NOT NULL REFERENCES core.accounts(id),
    last_used_at  timestamptz,
    expires_at    timestamptz,
    revoked_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);
```

- Format `ak_live_<32 random chars>`; shown **once** at creation.
- Hashed at rest. `key_prefix` lets the UI show `ak_live_a1b2c3d4…` for
  identification without storing the secret.
- Scoped to a property where possible, and to a capability list.
- **A key's permissions never exceed its creator's** at creation time, and are
  re-checked against the creator's current access on use — so revoking a
  person's property access also neuters keys they created.
- `last_used_at` updated asynchronously (a Redis counter flushed by a worker),
  not synchronously — otherwise every API call becomes a write.

---

## 8.10 Audit log

```sql
CREATE TABLE core.audit_log (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id  bigint NOT NULL,
    actor_id      bigint,                    -- null for system actions
    action        text   NOT NULL,           -- 'property.access.granted'
    target_type   text,
    target_id     text,
    metadata      jsonb  NOT NULL DEFAULT '{}',
    ip_hash       bytea,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.audit_log (workspace_id, created_at DESC);
```

Recorded for: login success/failure, password and MFA changes, member
invited/joined/removed, **any role or property-grant change**, property
created/deleted/purged, API key created/revoked, billing plan changes, data
export requests.

Permission changes are the highest-value entries — "who gave the contractor
access to the client's data, and when" is the question an audit log exists to
answer. Retention 24 months (Part 3 §3.9). Append-only; no update or delete
path exists in the repository layer.

---

## 8.11 Frontend integration

Closing the loops Part 7 left open.

**`AuthProvider`** (`context/providers/auth-provider.tsx`) on mount calls
`POST /auth/refresh`. The httpOnly cookie rides along automatically; on success
it sets `accessTokenAtom` and seeds the account query. Until it resolves, the
router shows a full-page loader — this is what prevents the login-page flash
described in Part 7 §7.16.

**Token refresh on 401.** An axios **response interceptor**
(`api/interceptors/refresh.ts`, Part 7 §7.5) catches a 401, calls refresh
**once** (with a module-level promise so concurrent 401s share one refresh, not
N), and replays the original request. A failed refresh clears auth state and
redirects to login. Without the shared-promise deduplication, a
dashboard firing eight parallel queries produces eight simultaneous refresh
calls, seven of which present an already-rotated token and trigger the §8.4
family-revocation logic — logging the user out for doing nothing wrong. This is
a subtle and very common bug.

**Property switcher** lists only `accessibleProperties` from the session
endpoint. A workspace with one accessible property renders no switcher at all.

**Capability-gated UI** via a `useCan()` hook reading the permission map from
§8.6. Buttons the user cannot use are **hidden, not disabled** — a disabled
button advertises a capability and invites a support ticket.

**Route guards** as Part 7 §7.12: `app.route.tsx` requires authentication,
`property.route.tsx` resolves the property id and throws to not-found if it is
absent from `accessibleProperties`, `settings.route.tsx` adds a capability
check.

---

## 8.12 What Part 12 must resolve

Part 8 has fixed who can do what. Part 12 must fix what a workspace has **paid
to be allowed to do**: the Razorpay subscription lifecycle, per-seat pricing
against the `memberships` count defined here, the entitlement checks that gate
seat and property creation, quota enforcement against Part 1's event volumes,
and the webhook handling that keeps subscription state correct.
