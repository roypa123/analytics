import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { isAuthenticatedAtom } from "@/context/atoms/auth"
import { listProperties } from "@/endpoints/properties"

export function useProperties() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)

  return useQuery({
    queryKey: queryKeys.properties.list(),
    queryFn: listProperties,
    staleTime: STALE_TIME.properties,
    enabled: isAuthenticated,
  })
}
