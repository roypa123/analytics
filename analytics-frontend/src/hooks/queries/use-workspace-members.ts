import { useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { listMembers } from "@/endpoints/workspace"

export function useWorkspaceMembers(workspaceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.members(workspaceId ?? -1),
    queryFn: () => listMembers(workspaceId as number),
    staleTime: STALE_TIME.workspace,
    enabled: workspaceId !== undefined,
  })
}
