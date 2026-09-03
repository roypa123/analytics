import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { flushSync } from "react-dom"

import { queryKeys } from "@/api/query-keys"
import { accessTokenAtom } from "@/context/atoms/auth"
import { register } from "@/endpoints/auth"
import type { RegisterRequest } from "@/types/api/auth"

export function useRegister() {
  const setAccessToken = useSetAtom(accessTokenAtom)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: RegisterRequest) => register(body),
    onSuccess: (result) => {
      // See use-login.ts — the caller navigates to a protected onboarding
      // route right after this resolves, so the router's context needs to
      // observe the new auth state before that navigation runs.
      flushSync(() => {
        setAccessToken(result.accessToken)
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })
    },
  })
}
