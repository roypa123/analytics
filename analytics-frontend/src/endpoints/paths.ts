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
    changePassword: "/auth/me/password",
  },
  properties: {
    root: "/properties",
    detail: (propertyId: number) => `/properties/${propertyId}`,
  },
  reports: {
    // Part 4 §4.14 — property-scoped analytics routes, mirrors
    // `app/api/v1/reports.py`'s `/properties/{property_id}/...` prefix.
    breakdown: (propertyId: number, dimension: string) =>
      `/properties/${propertyId}/reports/${dimension}`,
  },
  dashboard: {
    summary: (propertyId: number) => `/properties/${propertyId}/dashboard/summary`,
    trend: (propertyId: number) => `/properties/${propertyId}/dashboard/trend`,
  },
  realtime: {
    snapshot: (propertyId: number) => `/properties/${propertyId}/realtime`,
  },
  workspaces: {
    // Part 8 §8.2-§8.3, §8.6, §8.8 — mirrors `app/api/v1/workspace.py`'s
    // `/workspaces/{workspace_id}/...` prefix. Every action takes an
    // explicit workspace id (`workspace_service.py`'s module docstring
    // explains why: an implicit "the account's workspace" broke the moment
    // an account could belong to more than one, which accepting an
    // invitation makes possible).
    root: "/workspaces",
    acceptInvitation: "/workspaces/accept-invitation",
    detail: (workspaceId: number) => `/workspaces/${workspaceId}`,
    members: (workspaceId: number) => `/workspaces/${workspaceId}/members`,
    member: (workspaceId: number, accountId: number) =>
      `/workspaces/${workspaceId}/members/${accountId}`,
    invitations: (workspaceId: number) => `/workspaces/${workspaceId}/invitations`,
    invitation: (workspaceId: number, invitationId: number) =>
      `/workspaces/${workspaceId}/invitations/${invitationId}`,
  },
} as const
