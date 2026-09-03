// Part 7 §7.8, Rule R-02 — every query key comes from here. No inline key
// arrays anywhere else. The hierarchy is what makes invalidation work: e.g.
// invalidating properties.all() clears every list AND every detail.

import type { ReportDimension } from "@/routing/search-validators"

export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  workspaces: {
    all: () => ["workspaces"] as const,
    list: () => [...queryKeys.workspaces.all(), "list"] as const,
  },
  properties: {
    all: () => ["properties"] as const,
    // No workspaceId param yet: every account has exactly one workspace
    // today (D-25) and there is no workspace-switcher UI, so the backend
    // resolves "the" workspace from the authenticated account implicitly
    // (Part 4 property_service.py). Add the param back once that changes.
    list: () => [...queryKeys.properties.all(), "list"] as const,
    detail: (propertyId: string) => [...queryKeys.properties.all(), "detail", propertyId] as const,
  },
  reports: {
    all: () => ["reports"] as const,
    breakdown: (propertyId: number, dimension: ReportDimension) =>
      [...queryKeys.reports.all(), "breakdown", propertyId, dimension] as const,
  },
  dashboard: {
    all: () => ["dashboard"] as const,
    summary: (propertyId: number) => [...queryKeys.dashboard.all(), "summary", propertyId] as const,
    trend: (propertyId: number) => [...queryKeys.dashboard.all(), "trend", propertyId] as const,
  },
  realtime: {
    all: () => ["realtime"] as const,
    snapshot: (propertyId: number) =>
      [...queryKeys.realtime.all(), "snapshot", propertyId] as const,
  },
} as const
