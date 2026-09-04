import { createRoute } from "@tanstack/react-router"

import { SubscribePage } from "@/pages/billing/subscribe-page"
import { appRoute } from "@/routing/routes/app.route"

// Part 12 (revised: no free tier) — deliberately a sibling of `appShellRoute`
// under `appRoute`, not a child of it: it must stay reachable when
// `requireActiveSubscription` (routing/guards.ts) redirects here, so it only
// inherits `requireAuth`, never the subscription guard itself.
export const subscribeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/subscribe",
  component: SubscribePage,
})
