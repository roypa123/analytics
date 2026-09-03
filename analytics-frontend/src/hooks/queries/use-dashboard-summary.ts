import { useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { getDashboardSummary } from "@/endpoints/dashboard"

// The range always ends "now" (`reports_service.py`'s last-N-days-local
// window includes today), so it's a live range, not a closed one (Part 7
// §7.5's staleTime tiers).
export function useDashboardSummary(propertyId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(propertyId ?? -1),
    queryFn: () => getDashboardSummary(propertyId as number),
    staleTime: STALE_TIME.liveRange,
    enabled: propertyId !== undefined,
  })
}
