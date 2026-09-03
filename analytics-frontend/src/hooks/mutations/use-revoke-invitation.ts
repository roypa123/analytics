import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { revokeInvitation } from "@/endpoints/workspace"

export function useRevokeInvitation(workspaceId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (invitationId: number) => revokeInvitation(workspaceId, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(workspaceId) })
    },
  })
}
