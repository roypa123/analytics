import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { inviteMember } from "@/endpoints/workspace"
import type { InviteMemberRequest } from "@/types/api/workspace"

export function useInviteMember(workspaceId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: InviteMemberRequest) => inviteMember(workspaceId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(workspaceId) })
    },
  })
}
