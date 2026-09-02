import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { Provider as JotaiProvider } from "jotai"

import { queryClient } from "@/api/query-client"
import { useAuth } from "@/context/auth-context"
import { AuthProvider } from "@/context/providers/auth-provider"
import { ErrorBoundary } from "@/context/providers/error-boundary"
import { ThemeProvider } from "@/context/providers/theme-provider"
import { jotaiStore } from "@/context/store"
import { router } from "@/routing/router"

// Part 7 §7.16 — the nesting order is load-bearing, not arbitrary:
//   ErrorBoundary   outermost, or a provider crash is a white screen
//   QueryClient     ABOVE the router: beforeLoad/loaders need query access
//   Jotai           ABOVE AuthProvider: auth state is atoms
//   Theme           sets .dark before first paint
//   Auth            ABOVE RouterProvider: the guard needs resolved auth
//                   state on first render, or the login page flashes
//   RouterProvider  innermost
function RouterWithAuthContext() {
  const auth = useAuth()
  // Re-supplies live auth state into the router's context on every render
  // (Part 7 §7.12) — this is what lets `beforeLoad` guards see up-to-date
  // authentication instead of the placeholder set at router creation.
  return <RouterProvider router={router} context={{ auth }} />
}

export function AppProviders() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={jotaiStore}>
          <ThemeProvider>
            <AuthProvider>
              <RouterWithAuthContext />
            </AuthProvider>
          </ThemeProvider>
        </JotaiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
