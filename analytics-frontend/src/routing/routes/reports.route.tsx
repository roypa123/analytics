import { createRoute } from "@tanstack/react-router"

import { ReportsPage } from "@/pages/reports/reports-page"
import { appShellRoute } from "@/routing/routes/app-shell.route"
import { validateReportsSearch } from "@/routing/search-validators"

export const reportsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/reports",
  validateSearch: validateReportsSearch,
  component: ReportsPage,
})
