// Mirrors app/schemas/realtime.py (Part 2 §2.7).

export interface RealtimeSnapshot {
  activeVisitors: number
  activeCountries: { countryCode: string; count: number }[]
  activePages: { path: string; activeVisitors: number }[]
}
