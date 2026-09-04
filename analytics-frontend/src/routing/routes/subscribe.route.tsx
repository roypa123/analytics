import { createRoute } from "@tanstack/react-router"

import { SubscribePage } from "@/pages/billing/subscribe-page"
import { appShellRoute } from "@/routing/routes/app-shell.route"

// Part 12 (revised: no free tier) — a child of `appShellRoute` so Billing
// renders inside the normal sidebar layout (linked from `AppSidebar`)
// instead of a bare full-page redirect target. It carries no
// `requireActiveSubscription` beforeLoad of its own — it's the one place an
// unpaid account must always be able to reach — while `appShellRoute` itself
// also stays ungated so the sidebar (and this link) render regardless of
// subscription status.
export const subscribeRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/subscribe",
  component: SubscribePage,
})
