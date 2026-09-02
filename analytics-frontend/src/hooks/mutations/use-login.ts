import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"

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
      setAccessToken(result.accessToken)
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })
    },
  })
}
