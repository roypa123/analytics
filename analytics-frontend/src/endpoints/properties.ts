import { client } from "@/api/client"
import { paths } from "@/endpoints/paths"
import type { CreatePropertyRequest, PropertySummary } from "@/types/api/property"

// Part 7 §7.6 — plain async functions, no React, no caching.

interface Envelope<T> {
  data: T
}

export async function createProperty(body: CreatePropertyRequest): Promise<PropertySummary> {
  const res = await client.post<Envelope<PropertySummary>>(paths.properties.root, body)
  return res.data.data
}

export async function listProperties(): Promise<PropertySummary[]> {
  const res = await client.get<Envelope<PropertySummary[]>>(paths.properties.root)
  return res.data.data
}
