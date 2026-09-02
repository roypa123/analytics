import type { InternalAxiosRequestConfig } from "axios"

import { accessTokenAtom } from "@/context/atoms/auth"
import { jotaiStore } from "@/context/store"

// Part 7 §7.5 — request interceptor: attach the bearer token. Reads from the
// store directly (not a hook) since interceptors run outside React's render
// cycle.
export function attachAuthHeader(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = jotaiStore.get(accessTokenAtom)
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`)
  }
  return config
}
