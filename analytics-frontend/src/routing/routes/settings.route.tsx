import { createRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/pages/settings/settings-page"
import { requireActiveSubscription } from "@/routing/guards"
import { appShellRoute } from "@/routing/routes/app-shell.route"

export const settingsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/settings",
  beforeLoad: requireActiveSubscription,
  component: SettingsPage,
})
