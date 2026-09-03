import { createRoute } from "@tanstack/react-router"

import { ProfilePage } from "@/pages/profile/profile-page"
import { appShellRoute } from "@/routing/routes/app-shell.route"

export const profileRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/profile",
  component: ProfilePage,
})
