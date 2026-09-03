import { useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { getDashboardTrend } from "@/endpoints/dashboard"

export function useDashboardTrend(propertyId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard.trend(propertyId ?? -1),
    queryFn: () => getDashboardTrend(propertyId as number),
    staleTime: STALE_TIME.liveRange,
    enabled: propertyId !== undefined,
  })
}
