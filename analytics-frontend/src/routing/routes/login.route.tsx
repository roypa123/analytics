import { createRoute } from "@tanstack/react-router"

import { LoginPage } from "@/pages/auth/login-page"
import { rootRoute } from "@/routing/routes/root.route"
import { validateLoginSearch } from "@/routing/search-validators"

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateLoginSearch,
  component: LoginPage,
})
