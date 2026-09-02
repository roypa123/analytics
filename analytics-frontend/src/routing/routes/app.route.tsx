import { createRoute, Outlet } from "@tanstack/react-router"

import { requireAuth } from "@/routing/guards"
import { rootRoute } from "@/routing/routes/root.route"

// Part 7 §7.12 — the authenticated layout. Every child route inherits
// `requireAuth` structurally via this single `beforeLoad`.
export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: requireAuth,
  component: () => <Outlet />,
})
