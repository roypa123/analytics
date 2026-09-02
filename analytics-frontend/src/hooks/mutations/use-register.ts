import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"

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
      setAccessToken(result.accessToken)
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })
    },
  })
}
