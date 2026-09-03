import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { acceptInvitation } from "@/endpoints/workspace"
import type { AcceptInvitationRequest } from "@/types/api/workspace"

export function useAcceptInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: AcceptInvitationRequest) => acceptInvitation(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all() })
    },
  })
}
