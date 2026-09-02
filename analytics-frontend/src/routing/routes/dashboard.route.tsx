import { createRoute } from "@tanstack/react-router"

import { DashboardPage } from "@/pages/dashboard/dashboard-page"
import { appRoute } from "@/routing/routes/app.route"

export const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: DashboardPage,
})
