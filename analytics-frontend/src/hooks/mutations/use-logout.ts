import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"

import { clearAuthAtom } from "@/context/atoms/auth"
import { logout } from "@/endpoints/auth"

export function useLogout() {
  const navigate = useNavigate()
  const clearAuth = useSetAtom(clearAuthAtom)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Clear regardless of whether the server call succeeded — the user's
      // intent is to be logged out locally either way.
      clearAuth()
      queryClient.clear()
      // `requireAuth` (routing/guards.ts) only runs in `beforeLoad`, on a
      // route transition — clearing auth state alone does not re-trigger it
      // while already sitting on a protected route, so the redirect has to
      // be driven from here instead of relying on the guard to notice.
      void navigate({ to: "/login" })
    },
  })
}
