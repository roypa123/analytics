// Part 7 §7.12 — hand-written route search validators (C-03: no Zod).
// TanStack Router's `validateSearch` contract is `(input: unknown) => T`,
// so type safety flows from the return annotation regardless of how the
// parsing is authored.

import { asOneOf, asString } from "@/utils/validation"

export interface LoginSearch {
  redirect?: string
}

export function validateLoginSearch(input: Record<string, unknown>): LoginSearch {
  const redirect = asString(input.redirect)
  // Only accept a same-origin relative path — never hand an open redirect
  // target to `navigate()` (Part 7 §7.12).
  return { redirect: redirect?.startsWith("/") ? redirect : undefined }
}

export interface InstallSnippetSearch {
  trackingId?: string
}

// Carries the just-created property's tracking id from the create-property
// step to the install-snippet step without a second fetch. Falls back to
// `useProperties()` in the page itself if this is empty (e.g. a direct visit).
export function validateInstallSnippetSearch(
  input: Record<string, unknown>
): InstallSnippetSearch {
  return { trackingId: asString(input.trackingId) }
}

// Part 1 §1.2 (Tier 1) — the breakdown-table dimensions. Kept in the URL
// (rather than component state) so a report tab is bookmarkable/shareable,
// same rationale as `trackingId` above.
export const REPORT_DIMENSIONS = [
  "pages",
  "referrers",
  "sources",
  "locations",
  "devices",
  "browsers",
  "os",
] as const

export type ReportDimension = (typeof REPORT_DIMENSIONS)[number]

export interface ReportsSearch {
  dimension: ReportDimension
}

export function validateReportsSearch(input: Record<string, unknown>): ReportsSearch {
  return { dimension: asOneOf(input.dimension, REPORT_DIMENSIONS, "pages") }
}
