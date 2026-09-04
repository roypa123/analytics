import { createRoute } from "@tanstack/react-router"

import { ReportsPage } from "@/pages/reports/reports-page"
import { requireActiveSubscription } from "@/routing/guards"
import { appShellRoute } from "@/routing/routes/app-shell.route"
import { validateReportsSearch } from "@/routing/search-validators"

export const reportsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/reports",
  beforeLoad: requireActiveSubscription,
  validateSearch: validateReportsSearch,
  component: ReportsPage,
})
