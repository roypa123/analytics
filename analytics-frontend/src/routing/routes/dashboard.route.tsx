import { createRoute } from "@tanstack/react-router"

import { DashboardPage } from "@/pages/dashboard/dashboard-page"
import { appShellRoute } from "@/routing/routes/app-shell.route"

export const dashboardRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/dashboard",
  component: DashboardPage,
})
