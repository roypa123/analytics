import { useNavigate } from "@tanstack/react-router"
import { motion } from "framer-motion"
import {
  AppWindow,
  Cpu,
  FileText,
  Globe,
  Link2,
  Megaphone,
  Smartphone,
  type LucideIcon,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NoPropertyEmptyState } from "@/components/analytics/no-property-empty-state"
import { useProperties } from "@/hooks/queries/use-properties"
import { useReportBreakdown } from "@/hooks/queries/use-report-breakdown"
import { fadeUp, staggerContainer } from "@/lib/motion"
import { reportsRoute } from "@/routing/routes/reports.route"
import type { ReportDimension } from "@/routing/search-validators"

interface ReportTab {
  value: ReportDimension
  label: string
  dimensionLabel: string
  icon: LucideIcon
  description: string
}

// Part 1 §1.2 (Tier 1) — the documented breakdown-table dimensions (page
// path, referrer, UTM set, country/region, device type, browser, OS),
// collapsed into one tab per dimension rather than seven separate pages.
const REPORT_TABS: ReportTab[] = [
  {
    value: "pages",
    label: "Pages",
    dimensionLabel: "Page",
    icon: FileText,
    description: "Most-viewed pages in the selected range.",
  },
  {
    value: "referrers",
    label: "Referrers",
    dimensionLabel: "Referrer",
    icon: Link2,
    description: "External sites sending traffic to you.",
  },
  {
    value: "sources",
    label: "Sources",
    dimensionLabel: "Source / medium",
    icon: Megaphone,
    description: "Traffic grouped by UTM source and medium.",
  },
  {
    value: "locations",
    label: "Locations",
    dimensionLabel: "Country",
    icon: Globe,
    description: "Where your visitors are located.",
  },
  {
    value: "devices",
    label: "Devices",
    dimensionLabel: "Device type",
    icon: Smartphone,
    description: "Desktop, mobile, and tablet split.",
  },
  {
    value: "browsers",
    label: "Browsers",
    dimensionLabel: "Browser",
    icon: AppWindow,
    description: "Browser families your visitors use.",
  },
  {
    value: "os",
    label: "OS",
    dimensionLabel: "Operating system",
    icon: Cpu,
    description: "Operating systems your visitors use.",
  },
]

// The Tier-1 report metric columns (Part 1 §1.2's core metric list, minus
// the two that don't make sense per-row in a breakdown table).
const METRIC_COLUMNS = ["Sessions", "Pageviews", "Bounce rate"] as const

const numberFormatter = new Intl.NumberFormat()

interface ReportBreakdownTableProps {
  propertyId: number
  tab: ReportTab
}

// Only the active tab's `TabsContent` is mounted (Radix unmounts inactive
// ones rather than hiding them), so putting the query hook in its own
// component — instead of at the page level — means switching tabs fetches
// on demand, not all seven dimensions up front.
function ReportBreakdownTable({ propertyId, tab }: ReportBreakdownTableProps) {
  const { data, isLoading } = useReportBreakdown(propertyId, tab.value)
  const rows = data ?? []

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{tab.dimensionLabel}</TableHead>
          {METRIC_COLUMNS.map((column) => (
            <TableHead key={column} className="text-right">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={METRIC_COLUMNS.length + 1} className="p-0">
              <Skeleton className="m-4 h-64 w-[calc(100%-2rem)]" />
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={METRIC_COLUMNS.length + 1} className="p-0">
              <Empty className="border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <tab.icon />
                  </EmptyMedia>
                  <EmptyTitle>No {tab.label.toLowerCase()} data yet</EmptyTitle>
                  <EmptyDescription>
                    Once your tracking snippet starts sending events, this breakdown fills in.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.dimensionValue}>
              <TableCell className="max-w-xs truncate font-medium">{row.dimensionValue}</TableCell>
              <TableCell className="text-right">{numberFormatter.format(row.sessions)}</TableCell>
              <TableCell className="text-right">{numberFormatter.format(row.pageviews)}</TableCell>
              <TableCell className="text-right">{(row.bounceRate * 100).toFixed(1)}%</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

// Reports page: one breakdown table per Tier-1 dimension. Same honest-empty
// treatment as the dashboard (Part 5's ingestion pipeline doesn't persist
// events yet) — real column headers so the eventual shape is visible, an
// `Empty` state in place of fabricated rows.
export function ReportsPage() {
  const navigate = useNavigate()
  const search = reportsRoute.useSearch()
  const { data: properties, isLoading: isLoadingProperties } = useProperties()
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
          <h1 className="text-xl font-semibold">Reports</h1>
          {property && (
            <p className="text-sm text-muted-foreground">
              {property.name} · {property.domain}
            </p>
          )}
        </div>
        {property && <span className="text-sm text-muted-foreground">Last 7 days</span>}
      </motion.div>

      {isLoadingProperties ? (
        <Skeleton className="h-96 w-full" />
      ) : !property ? (
        <NoPropertyEmptyState />
      ) : (
        <motion.div variants={fadeUp}>
          <Tabs
            value={search.dimension}
            onValueChange={(value) =>
              void navigate({
                to: "/reports",
                search: { dimension: value as ReportDimension },
              })
            }
          >
            <TabsList className="flex-wrap">
              {REPORT_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  <tab.icon />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {REPORT_TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{tab.label}</CardTitle>
                    <CardDescription>{tab.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ReportBreakdownTable propertyId={property.id} tab={tab} />
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </motion.div>
      )}
    </motion.div>
  )
}
