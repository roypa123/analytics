// Mirrors app/schemas/reports.py (Part 1 §1.11-§1.12).

export interface ReportRow {
  dimensionValue: string
  sessions: number
  pageviews: number
  bounceRate: number // 0..1; format as a percentage
}
