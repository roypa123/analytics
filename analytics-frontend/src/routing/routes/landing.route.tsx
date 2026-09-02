import { createRoute } from "@tanstack/react-router"

import { LandingPage } from "@/pages/marketing/landing-page"
import { rootRoute } from "@/routing/routes/root.route"

// Part 7 §7.12, §7.17 — public marketing landing page. A sibling of
// loginRoute on rootRoute, not a child of the authenticated appRoute.
export const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
})
