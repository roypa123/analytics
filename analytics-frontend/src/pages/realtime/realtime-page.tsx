import { motion } from "framer-motion"
import { lazy, Suspense } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NoPropertyEmptyState } from "@/components/analytics/no-property-empty-state"
import { RealtimeCounter } from "@/components/analytics/realtime/realtime-counter"
import { RealtimePageList } from "@/components/analytics/realtime/realtime-page-list"
import { useRealtimeSnapshot } from "@/hooks/queries/use-realtime-snapshot"
import { useSelectedProperty } from "@/hooks/use-selected-property"
import { fadeUp, staggerContainer } from "@/lib/motion"

// `realtime-map.tsx` pulls in `dotted-map` (which needs `proj4` at runtime)
// plus a ~120 KB precomputed world dot grid — real weight that only the
// realtime page's visitors should pay for, not every route. `React.lazy`
// puts all of it in its own chunk, fetched on demand.
const RealtimeMap = lazy(() =>
  import("@/components/analytics/realtime/realtime-map").then((m) => ({ default: m.RealtimeMap }))
)

// Realtime view (Part 1 §1.2, Tier 1): "visitors in the last 30 minutes,"
// backed by `GET /properties/{id}/realtime` (Part 2 §2.7, Redis-backed) via
// the same `useRealtimeSnapshot` hook the dashboard's "Right now" card
// already uses. This page used to predate that endpoint and rendered the
// layout fed a hardcoded 0/empty everywhere — now it shows the real numbers.
export function RealtimePage() {
  const { property, isLoading: isLoadingProperties } = useSelectedProperty()
  const hasProperty = property !== undefined
  const { data: snapshot, isLoading: isLoadingSnapshot } = useRealtimeSnapshot(property?.id)

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex flex-col gap-6 p-6"
    >
      <motion.div
        variants={fadeUp}
        className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold">Realtime</h1>
          {property && (
            <p className="text-sm text-muted-foreground">
              {property.name} · {property.domain}
            </p>
          )}
        </div>
        {hasProperty && <span className="text-sm text-muted-foreground">Last 30 minutes</span>}
      </motion.div>

      {isLoadingProperties ? (
        <Skeleton className="h-64 w-full" />
      ) : !hasProperty ? (
        <NoPropertyEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">Right now</CardTitle>
                  <CardDescription>Active in the last 30 minutes.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingSnapshot ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <RealtimeCounter count={snapshot?.activeVisitors ?? 0} />
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={fadeUp} className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">Active locations</CardTitle>
                  <CardDescription>Where active visitors are right now.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingSnapshot ? (
                    <Skeleton className="aspect-[126/60] w-full" />
                  ) : (
                    <Suspense fallback={<Skeleton className="aspect-[126/60] w-full" />}>
                      <RealtimeMap activeCountries={snapshot?.activeCountries ?? []} />
                    </Suspense>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active pages</CardTitle>
                <CardDescription>What visitors are viewing right now.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSnapshot ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <RealtimePageList pages={snapshot?.activePages ?? []} />
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
