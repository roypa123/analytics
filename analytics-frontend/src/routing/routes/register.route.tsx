import { createRoute } from "@tanstack/react-router"

import { RegisterPage } from "@/pages/auth/register-page"
import { rootRoute } from "@/routing/routes/root.route"

export const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
})
