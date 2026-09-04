import { createRoute } from "@tanstack/react-router"

import { DashboardPage } from "@/pages/dashboard/dashboard-page"
import { requireActiveSubscription } from "@/routing/guards"
import { appShellRoute } from "@/routing/routes/app-shell.route"

export const dashboardRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/dashboard",
  beforeLoad: requireActiveSubscription,
  component: DashboardPage,
})
