// Part 7 §7.8, Rule R-02 — every query key comes from here. No inline key
// arrays anywhere else. The hierarchy is what makes invalidation work: e.g.
// invalidating properties.all() clears every list AND every detail.

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
    list: (workspaceId: string) => [...queryKeys.properties.all(), "list", workspaceId] as const,
    detail: (propertyId: string) => [...queryKeys.properties.all(), "detail", propertyId] as const,
  },
} as const
