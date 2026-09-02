import { appRoute } from "@/routing/routes/app.route"
import { dashboardRoute } from "@/routing/routes/dashboard.route"
import { landingRoute } from "@/routing/routes/landing.route"
import { loginRoute } from "@/routing/routes/login.route"
import { registerRoute } from "@/routing/routes/register.route"
import { rootRoute } from "@/routing/routes/root.route"

// Code-based route tree (Part 7 §7.3) rather than the file-based generator —
// avoids a codegen step in the Vite build and keeps routes inside
// src/routing/, matching the repository's committed folder convention.
export const routeTree = rootRoute.addChildren([
  landingRoute,
  loginRoute,
  registerRoute,
  appRoute.addChildren([dashboardRoute]),
])
