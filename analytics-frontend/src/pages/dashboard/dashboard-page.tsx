import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import {
  Activity,
  Clock,
  FileText,
  Fingerprint,
  Layers,
  LineChart,
  Link2,
  Percent,
  Users,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { NoPropertyEmptyState } from "@/components/analytics/no-property-empty-state"
import { RealtimeCounter } from "@/components/analytics/realtime/realtime-counter"
import { useProperties } from "@/hooks/queries/use-properties"
import { cardTap, cardVariants, fadeUp, iconPop, staggerContainer } from "@/lib/motion"

// Part 1 §1.2 (Tier 1) — the six core metrics. All still placeholders: real
// values arrive with the reporting API (Part 1 §1.11), not built yet.
const PLACEHOLDER_METRICS = [
  { label: "Sessions", value: "—", icon: Users },
  { label: "Pageviews", value: "—", icon: Activity },
  { label: "Unique visitors", value: "—", icon: Fingerprint },
  { label: "Bounce rate", value: "—", icon: Percent },
  { label: "Avg. session duration", value: "—", icon: Clock },
  { label: "Views / session", value: "—", icon: Layers },
] as const

// Placeholder for the Tier-1 overview (Part 1 §1.2). Proves the auth
// vertical slice end-to-end: protected route → authenticated request →
// account data rendered. Header/sign-out live in AppShell (Part 7 §7.10).
//
// Every section below the metric grid is an honest empty state, not
// fabricated numbers — the collector's ingestion pipeline (Part 5) doesn't
// persist events yet, so there is genuinely no data behind a chart or a
// breakdown table. A convincing-looking fake chart would be worse than no
// chart at all.
export function DashboardPage() {
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
          <h1 className="text-xl font-semibold">Dashboard</h1>
          {property && (
            <p className="text-sm text-muted-foreground">
              {property.name} · {property.domain}
            </p>
          )}
        </div>
        {hasProperty && <span className="text-sm text-muted-foreground">Last 7 days</span>}
      </motion.div>

      {isLoadingProperties ? (
        <Skeleton className="h-32 w-full" />
      ) : !hasProperty ? (
        <NoPropertyEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PLACEHOLDER_METRICS.map((metric) => (
              <motion.div
                key={metric.label}
                variants={cardVariants}
                whileHover="hover"
                whileTap={cardTap}
                className="cursor-default"
              >
                <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-lg hover:shadow-primary/5">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardDescription>{metric.label}</CardDescription>
                    <motion.span variants={iconPop} className="text-muted-foreground">
                      <metric.icon className="size-4" strokeWidth={1.5} />
                    </motion.span>
                  </CardHeader>
                  <CardContent>
                    <CardTitle className="text-2xl">{metric.value}</CardTitle>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <motion.div variants={fadeUp} className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">Sessions over time</CardTitle>
                  <CardDescription>Traffic trend for the selected range.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <LineChart />
                      </EmptyMedia>
                      <EmptyTitle>No data yet</EmptyTitle>
                      <EmptyDescription>
                        Once your tracking snippet starts sending events, traffic shows up here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">Right now</CardTitle>
                  <CardDescription>
                    <Link to="/realtime" className="underline underline-offset-4">
                      View realtime
                    </Link>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RealtimeCounter count={0} label="Visitors active" />
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">Top pages</CardTitle>
                  <CardDescription>Most-viewed pages in the selected range.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileText />
                      </EmptyMedia>
                      <EmptyTitle>No pageviews yet</EmptyTitle>
                    </EmptyHeader>
                    <EmptyContent>
                      <EmptyDescription>
                        <Link
                          to="/onboarding/snippet"
                          search={{ trackingId: property?.trackingId }}
                          className="underline underline-offset-4"
                        >
                          Revisit the install snippet
                        </Link>
                      </EmptyDescription>
                    </EmptyContent>
                  </Empty>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">Top referrers</CardTitle>
                  <CardDescription>Where visitors are coming from.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Link2 />
                      </EmptyMedia>
                      <EmptyTitle>No referrers yet</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  )
}
