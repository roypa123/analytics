import { createRoute } from "@tanstack/react-router"

import { AppShell } from "@/components/layout/app-shell"
import { requireActiveSubscription } from "@/routing/guards"
import { appRoute } from "@/routing/routes/app.route"

// Part 7 §7.10, §7.12 — the layout route for property-scoped pages. A
// sibling of the onboarding routes under `appRoute`, not a wrapper around
// all of it: onboarding renders full-page (§7.18), this renders the
// sidebar shell around its children.
export const appShellRoute = createRoute({
  getParentRoute: () => appRoute,
  id: "app-shell",
  beforeLoad: requireActiveSubscription,
  component: AppShell,
})
