import { useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { STALE_TIME } from "@/config/query-config"
import { getRealtimeSnapshot } from "@/endpoints/realtime"

// Part 2 §2.7 — the realtime path is Redis-backed and cheap, so a short
// staleTime keeps the "active now" figure close to live without polling
// aggressively (Part 7 §7.5's `realtime` tier).
export function useRealtimeSnapshot(propertyId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.realtime.snapshot(propertyId ?? -1),
    queryFn: () => getRealtimeSnapshot(propertyId as number),
    staleTime: STALE_TIME.realtime,
    refetchInterval: STALE_TIME.realtime,
    enabled: propertyId !== undefined,
  })
}
