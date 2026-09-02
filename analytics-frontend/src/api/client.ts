import axios from "axios"

import { attachAuthHeader } from "@/api/interceptors/auth"
import { normalizeError } from "@/api/interceptors/error"
import { registerRefreshInterceptor } from "@/api/interceptors/refresh"
import { env } from "@/config/env"

// Part 7 §7.5, C-02 — axios over fetch specifically for interceptors: the
// 401-refresh-and-retry flow and auth-header injection are naturally
// expressed here, whereas with `fetch` they would need a hand-rolled wrapper.
export const client = axios.create({
  baseURL: `${env.apiBaseUrl}/api/v1`,
  timeout: 30_000,
  // Required: the refresh token is an httpOnly cookie (Part 8 §8.4). Without
  // this flag it is never sent, and the bug only appears after the first
  // access token expires — easy to miss in quick testing.
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
})

client.interceptors.request.use(attachAuthHeader)

// Registration order matters: refresh must see the raw AxiosError before
// error-normalization converts it to an ApiError, so it is registered first.
registerRefreshInterceptor(client)
client.interceptors.response.use((response) => response, normalizeError)
