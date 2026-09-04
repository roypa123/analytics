import { createRoute } from "@tanstack/react-router"

import { CreatePropertyPage } from "@/pages/onboarding/create-property-page"
import { requireActiveSubscription } from "@/routing/guards"
import { appRoute } from "@/routing/routes/app.route"

// Part 12 (revised: no free tier) — the backend blocks property creation
// outright without an active subscription (app/api/deps.py), so a
// newly-registered account is sent straight to `/subscribe` here rather
// than reaching a form that can only ever fail.
export const createPropertyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/onboarding/property",
  beforeLoad: requireActiveSubscription,
  component: CreatePropertyPage,
})
