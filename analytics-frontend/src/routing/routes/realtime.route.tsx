import { createRoute } from "@tanstack/react-router"

import { RealtimePage } from "@/pages/realtime/realtime-page"
import { requireActiveSubscription } from "@/routing/guards"
import { appShellRoute } from "@/routing/routes/app-shell.route"

export const realtimeRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/realtime",
  beforeLoad: requireActiveSubscription,
  component: RealtimePage,
})
