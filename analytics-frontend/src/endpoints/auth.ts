import { client } from "@/api/client"
import { paths } from "@/endpoints/paths"
import type { AccessTokenResponse, AccountSummary, LoginRequest, RegisterRequest } from "@/types/api/auth"

// Part 7 §7.6 — plain async functions, no React, no caching. Consumed by
// hooks/mutations (React) but also directly by context/providers/auth-provider.tsx
// on app bootstrap, which is exactly why this layer stays framework-free.

interface Envelope<T> {
  data: T
}

export async function register(body: RegisterRequest): Promise<AccessTokenResponse> {
  const res = await client.post<Envelope<AccessTokenResponse>>(paths.auth.register, body)
  return res.data.data
}

export async function login(body: LoginRequest): Promise<AccessTokenResponse> {
  const res = await client.post<Envelope<AccessTokenResponse>>(paths.auth.login, body)
  return res.data.data
}

export async function refresh(): Promise<AccessTokenResponse> {
  const res = await client.post<Envelope<AccessTokenResponse>>(paths.auth.refresh)
  return res.data.data
}

export async function logout(): Promise<void> {
  await client.post(paths.auth.logout)
}

export async function getCurrentAccount(): Promise<AccountSummary> {
  const res = await client.get<Envelope<AccountSummary>>(paths.auth.me)
  return res.data.data
}
