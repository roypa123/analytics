import { client } from "@/api/client"
import { paths } from "@/endpoints/paths"
import type { RealtimeSnapshot } from "@/types/api/realtime"

// Part 7 §7.6 — plain async functions, no React, no caching.

interface Envelope<T> {
  data: T
}

export async function getRealtimeSnapshot(propertyId: number): Promise<RealtimeSnapshot> {
  const res = await client.get<Envelope<RealtimeSnapshot>>(paths.realtime.snapshot(propertyId))
  return res.data.data
}
