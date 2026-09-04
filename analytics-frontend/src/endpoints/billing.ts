import { client } from "@/api/client"
import { paths } from "@/endpoints/paths"
import type {
  ConfirmCheckoutRequest,
  StartCheckoutResponse,
  SubscriptionStatus,
} from "@/types/api/billing"

// Part 7 §7.6 — plain async functions, no React, no caching.

interface Envelope<T> {
  data: T
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const res = await client.get<Envelope<SubscriptionStatus>>(paths.billing.status)
  return res.data.data
}

export async function startCheckout(): Promise<StartCheckoutResponse> {
  const res = await client.post<Envelope<StartCheckoutResponse>>(paths.billing.subscribe)
  return res.data.data
}

export async function confirmCheckout(
  body: ConfirmCheckoutRequest
): Promise<SubscriptionStatus> {
  const res = await client.post<Envelope<SubscriptionStatus>>(paths.billing.confirm, body)
  return res.data.data
}
