import { useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { getReportBreakdown } from "@/endpoints/reports"
import type { ReportDimension } from "@/routing/search-validators"

// The range always ends "now" (`reports_service.py`'s last-N-days-local
// window includes today), so it's a live range, not a closed one (Part 7
// §7.5's staleTime tiers).
export function useReportBreakdown(propertyId: number | undefined, dimension: ReportDimension) {
  return useQuery({
    queryKey: queryKeys.reports.breakdown(propertyId ?? -1, dimension),
    queryFn: () => getReportBreakdown(propertyId as number, dimension),
    staleTime: STALE_TIME.liveRange,
    enabled: propertyId !== undefined,
  })
}
