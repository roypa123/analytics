import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { isAuthenticatedAtom } from "@/context/atoms/auth"
import { getSubscriptionStatus } from "@/endpoints/billing"

export function useSubscriptionStatus() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)

  return useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: getSubscriptionStatus,
    staleTime: STALE_TIME.billing,
    enabled: isAuthenticated,
  })
}
