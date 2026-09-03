import { client } from "@/api/client"
import { paths } from "@/endpoints/paths"
import type { ReportDimension } from "@/routing/search-validators"
import type { ReportRow } from "@/types/api/reports"

// Part 7 §7.6 — plain async functions, no React, no caching.

interface Envelope<T> {
  data: T
}

export async function getReportBreakdown(
  propertyId: number,
  dimension: ReportDimension
): Promise<ReportRow[]> {
  const res = await client.get<Envelope<ReportRow[]>>(
    paths.reports.breakdown(propertyId, dimension)
  )
  return res.data.data
}
