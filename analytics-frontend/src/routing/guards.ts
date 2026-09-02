import { redirect } from "@tanstack/react-router"

import type { AuthContextValue } from "@/context/auth-context"

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
