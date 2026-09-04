// Mirrors app/schemas/property.py (Part 1 §1.5, Part 3 §3.2).

import type { PropertyRole } from "@/types/api/workspace"

export interface CreatePropertyRequest {
  name: string
  domain: string
}

export interface PropertySummary {
  id: number
  name: string
  domain: string
  trackingId: string
  timezone: string
  // Part 8 §8.6's property-scoped matrix — "admin" for a workspace
  // owner/admin (rule 1), otherwise the account's own grant. Gates
  // component-level UI (e.g. a viewer can't see the tracking snippet).
  myRole: PropertyRole
}
