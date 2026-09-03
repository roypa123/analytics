import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { flushSync } from "react-dom"

import { queryKeys } from "@/api/query-keys"
import { accessTokenAtom } from "@/context/atoms/auth"
import { login } from "@/endpoints/auth"
import type { LoginRequest } from "@/types/api/auth"

export function useLogin() {
  const setAccessToken = useSetAtom(accessTokenAtom)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: LoginRequest) => login(body),
    onSuccess: (result) => {
      // `flushSync` forces React to re-render (and RouterProvider to call
      // `router.update({ context })`, see RouterProvider.js) before this
      // callback returns. Without it, the caller's own `onSuccess` (which
      // navigates to a protected route right after this resolves) runs
      // before the router's context has picked up the new auth state, so
      // `requireAuth`'s `beforeLoad` still sees `isAuthenticated: false` and
      // bounces back to /login — only a second click succeeds, because by
      // then React has had time to flush the first click's update.
      flushSync(() => {
        setAccessToken(result.accessToken)
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })
    },
  })
}
