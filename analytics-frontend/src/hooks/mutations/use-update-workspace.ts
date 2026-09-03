import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { updateWorkspace } from "@/endpoints/workspace"
import type { UpdateWorkspaceRequest } from "@/types/api/workspace"

export function useUpdateWorkspace(workspaceId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateWorkspaceRequest) => updateWorkspace(workspaceId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all() })
    },
  })
}
