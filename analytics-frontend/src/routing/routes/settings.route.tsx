import { createRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/pages/settings/settings-page"
import { appShellRoute } from "@/routing/routes/app-shell.route"

export const settingsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/settings",
  component: SettingsPage,
})
