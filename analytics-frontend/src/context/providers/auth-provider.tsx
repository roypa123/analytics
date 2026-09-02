import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useState } from "react"

import { AuthContext } from "@/context/auth-context"
import { accessTokenAtom, isAuthenticatedAtom } from "@/context/atoms/auth"
import { refresh as refreshEndpoint } from "@/endpoints/auth"

// Part 7 §7.16, Part 8 §8.11 — on mount, attempt to re-establish the session
// from the httpOnly refresh cookie. Until this resolves, render a full-page
// loader (children are withheld) rather than the login page — this is what
// prevents an authenticated user from seeing a login-page flash on reload.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setAccessToken = useSetAtom(accessTokenAtom)
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  useEffect(() => {
    let cancelled = false

    refreshEndpoint()
      .then((result) => {
        if (!cancelled) setAccessToken(result.accessToken)
      })
      .catch(() => {
        // No valid session cookie — expected for a first-time or logged-out
        // visitor. Nothing to do; isAuthenticated stays false.
      })
      .finally(() => {
        if (!cancelled) setIsBootstrapping(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isBootstrapping) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isBootstrapping }}>
      {children}
    </AuthContext.Provider>
  )
}
