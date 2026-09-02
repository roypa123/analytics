import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"

import { clearAuthAtom } from "@/context/atoms/auth"
import { logout } from "@/endpoints/auth"

export function useLogout() {
  const clearAuth = useSetAtom(clearAuthAtom)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Clear regardless of whether the server call succeeded — the user's
      // intent is to be logged out locally either way.
      clearAuth()
      queryClient.clear()
    },
  })
}
