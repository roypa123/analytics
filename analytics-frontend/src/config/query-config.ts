// Part 7 §7.5 — staleTime tiers. Closed historical data is immutable
// (Part 2 §2.6), so it can be cached hard; ranges including "today" cannot.

export const STALE_TIME = {
  closedRange: 10 * 60_000,
  liveRange: 60_000,
  realtime: 10_000,
  account: 5 * 60_000,
  properties: 5 * 60_000,
  workspace: 5 * 60_000,
  // Short: right after a payment, the route guard (routing/guards.ts) needs
  // this to reflect reality within seconds, not the 5-minute tier account
  // data gets.
  billing: 15_000,
} as const
