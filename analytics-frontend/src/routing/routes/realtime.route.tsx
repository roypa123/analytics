import { createRoute } from "@tanstack/react-router"

import { RealtimePage } from "@/pages/realtime/realtime-page"
import { appShellRoute } from "@/routing/routes/app-shell.route"

export const realtimeRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/realtime",
  component: RealtimePage,
})
