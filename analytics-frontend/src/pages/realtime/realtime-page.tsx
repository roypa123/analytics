import { motion } from "framer-motion"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NoPropertyEmptyState } from "@/components/analytics/no-property-empty-state"
import { RealtimeCounter } from "@/components/analytics/realtime/realtime-counter"
import { RealtimePageList } from "@/components/analytics/realtime/realtime-page-list"
import { useProperties } from "@/hooks/queries/use-properties"
import { fadeUp, staggerContainer } from "@/lib/motion"

// Realtime view (Part 1 §1.2, Tier 1): "visitors in the last 30 minutes."
// No realtime endpoint exists yet (Part 5's ingestion pipeline isn't wired
// up), so this renders the real layout — hero counter + active-pages
// breakdown — fed a count of 0 and an empty page list instead of a fake
// "connecting..." spinner. Same honest-empty approach as the dashboard and
// reports pages.
export function RealtimePage() {
  const { data: properties, isLoading: isLoadingProperties } = useProperties()
  const hasProperty = (properties?.length ?? 0) > 0
  const property = properties?.[0]

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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <motion.div variants={fadeUp}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Right now</CardTitle>
                <CardDescription>Active in the last 30 minutes.</CardDescription>
              </CardHeader>
              <CardContent>
                <RealtimeCounter count={0} />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUp} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Active pages</CardTitle>
                <CardDescription>What visitors are viewing right now.</CardDescription>
              </CardHeader>
              <CardContent>
                <RealtimePageList pages={[]} />
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
