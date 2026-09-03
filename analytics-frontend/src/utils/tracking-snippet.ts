import { env } from "@/config/env"

// There is no real CDN yet (Part 2 §2.3) — the collector deployable serves
// this file itself at `GET /tracker.js` (app/collector/main.py), so this
// snippet is genuinely functional, not a placeholder. `data-collector-url`
// is set explicitly to VITE_COLLECTOR_URL (config/env.ts) rather than
// relying on the script's own localhost default, so the same generated
// snippet keeps working once the collector's URL differs per environment.
export function buildTrackingSnippet(trackingId: string): string {
  return `<script defer src="${env.collectorUrl}/tracker.js" data-tracking-id="${trackingId}" data-collector-url="${env.collectorUrl}"></script>`
}
