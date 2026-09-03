import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import {
  Activity,
  Clock,
  FileText,
  Fingerprint,
  Layers,
  LineChart as LineChartIcon,
  Link2,
  Percent,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

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
import { useDashboardSummary } from "@/hooks/queries/use-dashboard-summary"
import { useDashboardTrend } from "@/hooks/queries/use-dashboard-trend"
import { useProperties } from "@/hooks/queries/use-properties"
import { useRealtimeSnapshot } from "@/hooks/queries/use-realtime-snapshot"
import { useReportBreakdown } from "@/hooks/queries/use-report-breakdown"
import { cardTap, cardVariants, fadeUp, iconPop, staggerContainer } from "@/lib/motion"
import type { ReportDimension } from "@/routing/search-validators"
import type { DashboardSummary } from "@/types/api/dashboard"

const numberFormatter = new Intl.NumberFormat()

function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds)
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`
}

function formatTickDate(value: unknown): string {
  return typeof value === "string"
    ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : ""
}

// Part 1 §1.2 (Tier 1) — the six core metrics, sourced from
// `GET /properties/{id}/dashboard/summary`.
const METRIC_DEFS: { label: string; icon: LucideIcon }[] = [
  { label: "Sessions", icon: Users },
  { label: "Pageviews", icon: Activity },
  { label: "Unique visitors", icon: Fingerprint },
  { label: "Bounce rate", icon: Percent },
  { label: "Avg. session duration", icon: Clock },
  { label: "Views / session", icon: Layers },
]

function metricValues(summary: DashboardSummary | undefined): string[] {
  if (!summary) return ["—", "—", "—", "—", "—", "—"]
  return [
    numberFormatter.format(summary.sessions),
    numberFormatter.format(summary.pageviews),
    `${summary.isVisitorsApproximate ? "~" : ""}${numberFormatter.format(summary.visitorsApprox)}`,
    `${(summary.bounceRate * 100).toFixed(1)}%`,
    formatDuration(summary.avgSessionDurationSeconds),
    summary.viewsPerSession.toFixed(2),
  ]
}

interface SessionsTrendChartProps {
  propertyId: number
}

// Part 1 §1.2's "time-series dashboard" feature, backed by
// `GET /properties/{id}/dashboard/trend` (Part 5 §5.11's zero-filled days).
function SessionsTrendChart({ propertyId }: SessionsTrendChartProps) {
  const { data, isLoading } = useDashboardTrend(propertyId)
  const points = data ?? []
  const hasData = points.some((point) => point.sessions > 0 || point.pageviews > 0)

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (!hasData) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LineChartIcon />
          </EmptyMedia>
          <EmptyTitle>No data yet</EmptyTitle>
          <EmptyDescription>
            Once your tracking snippet starts sending events, traffic shows up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={256}>
      <RechartsLineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatTickDate}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
        <Tooltip labelFormatter={formatTickDate} contentStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="sessions"
          name="Sessions"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="pageviews"
          name="Pageviews"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          dot={false}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}

interface TopBreakdownListProps {
  propertyId: number
  dimension: ReportDimension
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription?: ReactNode
}

// "Top pages" / "Top referrers" — the dashboard's condensed view of the same
// breakdown data `reports-page.tsx` shows in full (`useReportBreakdown`),
// trimmed to the top 5 by pageviews.
function TopBreakdownList({
  propertyId,
  dimension,
  emptyIcon: Icon,
  emptyTitle,
  emptyDescription,
}: TopBreakdownListProps) {
  const { data, isLoading } = useReportBreakdown(propertyId, dimension)
  const rows = (data ?? []).slice(0, 5)

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />
  }

  if (rows.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
        </EmptyHeader>
        {emptyDescription && (
          <EmptyContent>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyContent>
        )}
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.dimensionValue} className="flex items-center justify-between gap-4 text-sm">
          <span className="max-w-[70%] truncate font-mono text-xs text-muted-foreground">
            {row.dimensionValue}
          </span>
          <span className="tabular-nums font-medium">{numberFormatter.format(row.pageviews)}</span>
        </li>
      ))}
    </ul>
  )
}

// Dashboard: the Tier-1 overview (Part 1 §1.2), backed by
// `GET /properties/{id}/dashboard/{summary,trend}`, the realtime endpoint,
// and the Tier-1 breakdown endpoint reused from the Reports page. Every
// section renders the real layout fed real data — an honest `Empty` state
// only when the property genuinely has no events yet, never a fabricated
// chart or number.
export function DashboardPage() {
  const { data: properties, isLoading: isLoadingProperties } = useProperties()
  const property = properties?.[0]
  const { data: summary, isLoading: isLoadingSummary } = useDashboardSummary(property?.id)
  const { data: realtime } = useRealtimeSnapshot(property?.id)
  const values = metricValues(summary)

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
        {property && <span className="text-sm text-muted-foreground">Last 7 days</span>}
      </motion.div>

      {isLoadingProperties ? (
        <Skeleton className="h-32 w-full" />
      ) : !property ? (
        <NoPropertyEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {METRIC_DEFS.map((metric, index) => (
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
                    <CardTitle className="text-2xl">
                      {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : values[index]}
                    </CardTitle>
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
                  <SessionsTrendChart propertyId={property.id} />
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
                  <RealtimeCounter count={realtime?.activeVisitors ?? 0} label="Visitors active" />
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
                  <TopBreakdownList
                    propertyId={property.id}
                    dimension="pages"
                    emptyIcon={FileText}
                    emptyTitle="No pageviews yet"
                    emptyDescription={
                      <Link
                        to="/onboarding/snippet"
                        search={{ trackingId: property.trackingId }}
                        className="underline underline-offset-4"
                      >
                        Revisit the install snippet
                      </Link>
                    }
                  />
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
                  <TopBreakdownList
                    propertyId={property.id}
                    dimension="referrers"
                    emptyIcon={Link2}
                    emptyTitle="No referrers yet"
                  />
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  )
}
