// Mirrors app/schemas/property.py (Part 1 §1.5, Part 3 §3.2).

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
}
