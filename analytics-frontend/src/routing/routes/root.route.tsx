import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import type { AuthContextValue } from "@/context/auth-context"

interface RouterContext {
  auth: AuthContextValue
}

// Part 7 §7.12 — `createRootRouteWithContext` is what makes `context.auth`
// available (and typed) in every route's `beforeLoad`, including the
// requireAuth guard on app.route.tsx.
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
})
