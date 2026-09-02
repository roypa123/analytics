import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { isAuthenticatedAtom } from "@/context/atoms/auth"
import { getCurrentAccount } from "@/endpoints/auth"

export function useCurrentAccount() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)

  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: getCurrentAccount,
    staleTime: STALE_TIME.account,
    enabled: isAuthenticated,
  })
}
