# Manual test credentials — login/register smoke test

Created while verifying the Individual/Organisation tabs on the login and
register pages (Part 8 §8.8, D-25) end-to-end against the live dev API
(`http://127.0.0.1:8000`). Not real accounts — safe to delete/rotate/ignore
in version control hygiene terms, but harmless to keep since the dev DB is
not production data.

## Individual account

| Field | Value |
| --- | --- |
| Email | `nexlytics.individual.1788421869@example.com` |
| Password | `TestPass1234!` |
| Full name | Individual Tester |

Sign in on the **Individual** tab (no organisation field shown).

## Organisation account

| Field | Value |
| --- | --- |
| Email | `nexlytics.org.1788421869@example.com` |
| Password | `TestPass1234!` |
| Full name | Org Tester |
| Organisation name | `Acme Test Org 1788421869` |

Sign in on the **Organisation** tab — the organisation name must match
exactly, or login is rejected with `organisation_mismatch` even though the
password is correct.

## What was verified (2026-09-03)

- `POST /api/v1/auth/register` — Individual tab (no `organisationName`) → `200`, access token returned.
- `POST /api/v1/auth/register` — Organisation tab (`organisationName` set) → `200`, access token returned, workspace created with that name.
- `POST /api/v1/auth/login` — Individual account, no org name → `200`.
- `POST /api/v1/auth/login` — Organisation account, correct org name → `200`.
- `POST /api/v1/auth/login` — Organisation account, wrong org name → `401 organisation_mismatch` (correctly rejected).
- `POST /api/v1/auth/login` — correct email, wrong password → `401 invalid_credentials` (correctly rejected).

All four positive/negative paths returned the expected status codes and
error codes from `app/services/auth_service.py`. Frontend forms (`login-page.tsx`,
`register-page.tsx`) send matching field names (`email`, `password`, `fullName`,
`organisationName`) via `CamelModel`-aliased schemas — no request-shape mismatch.
