import { createContext, useContext } from "react"

// Part 7 §7.9, §7.12 — the typed handle AuthProvider exposes to the router
// guard (via router context, Part 8 §8.11) and to components that need to
// know bootstrap state, distinct from the raw Jotai atom.
export interface AuthContextValue {
  isAuthenticated: boolean
  isBootstrapping: boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
