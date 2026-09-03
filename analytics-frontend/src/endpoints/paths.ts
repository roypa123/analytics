// Part 7 §7.6 — every URL in one place. A backend route rename is a
// one-file change, and MSW test handlers import from here too, so a mock
// can never silently diverge from a real path.

export const paths = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
  },
  properties: {
    root: "/properties",
  },
  reports: {
    // Part 4 §4.14 — property-scoped analytics routes, mirrors
    // `app/api/v1/reports.py`'s `/properties/{property_id}/...` prefix.
    breakdown: (propertyId: number, dimension: string) =>
      `/properties/${propertyId}/reports/${dimension}`,
  },
} as const
