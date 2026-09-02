// Part 7 §7.13 — route path constants. Closed-set values as `const` objects,
// never TS enums (Part 0 F-03: erasableSyntaxOnly forbids enums).

export const ROUTES = {
  login: "/login",
  register: "/register",
  dashboard: (propertyId: string) => `/p/${propertyId}`,
  realtime: (propertyId: string) => `/p/${propertyId}/realtime`,
  settingsMembers: (workspaceId: string) => `/workspaces/${workspaceId}/members`,
} as const
