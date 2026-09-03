import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { isAuthenticatedAtom } from "@/context/atoms/auth"
import { listWorkspaces } from "@/endpoints/workspace"

export function useWorkspaces() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)

  return useQuery({
    queryKey: queryKeys.workspaces.list(),
    queryFn: listWorkspaces,
    staleTime: STALE_TIME.workspace,
    enabled: isAuthenticated,
  })
}
