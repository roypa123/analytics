import { client } from "@/api/client"
import { paths } from "@/endpoints/paths"
import type { DashboardSummary, DashboardTrendPoint } from "@/types/api/dashboard"

// Part 7 §7.6 — plain async functions, no React, no caching.

interface Envelope<T> {
  data: T
}

export async function getDashboardSummary(propertyId: number): Promise<DashboardSummary> {
  const res = await client.get<Envelope<DashboardSummary>>(paths.dashboard.summary(propertyId))
  return res.data.data
}

export async function getDashboardTrend(propertyId: number): Promise<DashboardTrendPoint[]> {
  const res = await client.get<Envelope<DashboardTrendPoint[]>>(paths.dashboard.trend(propertyId))
  return res.data.data
}
