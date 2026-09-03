import { useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { listInvitations } from "@/endpoints/workspace"

export function useWorkspaceInvitations(workspaceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaces.invitations(workspaceId ?? -1),
    queryFn: () => listInvitations(workspaceId as number),
    staleTime: STALE_TIME.workspace,
    enabled: workspaceId !== undefined,
  })
}
