import { createRoute } from "@tanstack/react-router"

import { AppShell } from "@/components/layout/app-shell"
import { appRoute } from "@/routing/routes/app.route"

// Part 7 §7.10, §7.12 — the layout route for property-scoped pages. A
// sibling of the onboarding routes under `appRoute`, not a wrapper around
// all of it: onboarding renders full-page (§7.18), this renders the
// sidebar shell around its children.
//
// Part 12 (revised: no free tier) — deliberately NOT gated by
// `requireActiveSubscription` here: the shell (and its sidebar, which
// carries the Billing link) must render for every authenticated account
// regardless of subscription status, so an unpaid account can actually
// reach Billing. The gate instead lives on the individual data routes
// (dashboard/reports/realtime/settings) that the backend also blocks with a
// 402 — see their route files and `routing/guards.ts`.
export const appShellRoute = createRoute({
  getParentRoute: () => appRoute,
  id: "app-shell",
  component: AppShell,
})
