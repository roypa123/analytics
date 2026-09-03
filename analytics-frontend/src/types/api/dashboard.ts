// Mirrors app/schemas/dashboard.py (Part 1 §1.2 Tier 1).

export interface DashboardSummary {
  rangeStart: string // ISO date
  rangeEnd: string // ISO date
  sessions: number
  pageviews: number
  bounceRate: number // 0..1
  avgSessionDurationSeconds: number
  viewsPerSession: number
  visitorsApprox: number
  isVisitorsApproximate: boolean
}

export interface DashboardTrendPoint {
  date: string // ISO date
  sessions: number
  pageviews: number
}
