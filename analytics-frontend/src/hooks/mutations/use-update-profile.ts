import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { updateProfile } from "@/endpoints/auth"
import type { UpdateProfileRequest } from "@/types/api/auth"

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => updateProfile(body),
    onSuccess: (account) => {
      queryClient.setQueryData(queryKeys.auth.me(), account)
    },
  })
}
