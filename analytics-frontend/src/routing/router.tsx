import { createRouter } from "@tanstack/react-router"

import type { AuthContextValue } from "@/context/auth-context"
import { routeTree } from "@/routing/route-tree"

// The `context.auth` value here is a placeholder (`undefined!`) — the real
// value is supplied per-render by <RouterProvider context={{ auth }} />
// (context/providers/app-providers.tsx), which is what lets beforeLoad see
// live auth state (Part 7 §7.12).
export const router = createRouter({
  routeTree,
  context: { auth: undefined as unknown as AuthContextValue },
  defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
