import { appShellRoute } from "@/routing/routes/app-shell.route"
import { appRoute } from "@/routing/routes/app.route"
import { dashboardRoute } from "@/routing/routes/dashboard.route"
import { landingRoute } from "@/routing/routes/landing.route"
import { loginRoute } from "@/routing/routes/login.route"
import { createPropertyRoute } from "@/routing/routes/onboarding/create-property.route"
import { installSnippetRoute } from "@/routing/routes/onboarding/install-snippet.route"
import { profileRoute } from "@/routing/routes/profile.route"
import { realtimeRoute } from "@/routing/routes/realtime.route"
import { registerRoute } from "@/routing/routes/register.route"
import { reportsRoute } from "@/routing/routes/reports.route"
import { rootRoute } from "@/routing/routes/root.route"
import { settingsRoute } from "@/routing/routes/settings.route"
import { subscribeRoute } from "@/routing/routes/subscribe.route"

// Code-based route tree (Part 7 §7.3) rather than the file-based generator —
// avoids a codegen step in the Vite build and keeps routes inside
// src/routing/, matching the repository's committed folder convention.
export const routeTree = rootRoute.addChildren([
  landingRoute,
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    appShellRoute.addChildren([
      dashboardRoute,
      reportsRoute,
      realtimeRoute,
      profileRoute,
      settingsRoute,
    ]),
    createPropertyRoute,
    installSnippetRoute,
    subscribeRoute,
  ]),
])
