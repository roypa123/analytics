import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { updateMemberRole } from "@/endpoints/workspace"
import type { UpdateMemberRoleRequest } from "@/types/api/workspace"

export function useUpdateMemberRole(workspaceId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ accountId, body }: { accountId: number; body: UpdateMemberRoleRequest }) =>
      updateMemberRole(workspaceId, accountId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(workspaceId) })
    },
  })
}
