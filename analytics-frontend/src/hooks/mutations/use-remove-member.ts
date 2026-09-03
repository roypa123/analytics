import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { removeMember } from "@/endpoints/workspace"

export function useRemoveMember(workspaceId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (accountId: number) => removeMember(workspaceId, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(workspaceId) })
    },
  })
}
