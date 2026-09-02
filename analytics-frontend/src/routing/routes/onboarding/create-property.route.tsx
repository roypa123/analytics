import { createRoute } from "@tanstack/react-router"

import { CreatePropertyPage } from "@/pages/onboarding/create-property-page"
import { appRoute } from "@/routing/routes/app.route"

export const createPropertyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/onboarding/property",
  component: CreatePropertyPage,
})
