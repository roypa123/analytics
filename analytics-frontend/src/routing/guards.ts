import { redirect } from "@tanstack/react-router"

import { queryClient } from "@/api/query-client"
import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import type { AuthContextValue } from "@/context/auth-context"
import { getSubscriptionStatus } from "@/endpoints/billing"

// Part 7 §7.12 — lives on the protected layout route's `beforeLoad`, so
// every child route inherits it structurally; there is no per-route opt-in
// to forget. Auth state arrives via router context (set in routing/router.tsx
// from AuthProvider), not by reading the Jotai atom directly — beforeLoad
// runs outside React's render cycle, where a direct atom read could be stale.
export function requireAuth({
  context,
  location,
}: {
  context: { auth: AuthContextValue }
  location: { href: string }
}): void {
  if (!context.auth.isAuthenticated) {
    // The redirect target must be validated as a relative path before use
    // when consumed on the login page (Part 7 §7.12) — an unvalidated
    // `redirect` search param is an open-redirect vector.
    throw redirect({ to: "/login", search: { redirect: location.href } })
  }
}

// Part 12 (revised: no free tier) — on `appShellRoute` (Dashboard, Reports,
// Realtime, Settings, Profile) and the onboarding property-creation routes,
// which the backend also gates (app/api/deps.py's `require_active_subscription`
// blocks property creation outright). Without this, those pages would render
// and then silently fail every request instead of sending the user
// somewhere they can actually do something about it.
//
// Uses `queryClient` directly rather than router context (unlike
// `requireAuth`'s `context.auth`) because this needs a real network call,
// not a synchronous flag — `fetchQuery` still respects the query's
// `staleTime`, so most navigations within the same short window resolve
// from cache rather than re-hitting the API on every route change.
export async function requireActiveSubscription(): Promise<void> {
  const status = await queryClient.fetchQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: getSubscriptionStatus,
    staleTime: STALE_TIME.billing,
  })
  if (!status.hasAccess) {
    throw redirect({ to: "/subscribe" })
  }
}
