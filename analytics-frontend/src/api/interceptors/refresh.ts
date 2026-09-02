import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios"

import { accessTokenAtom, clearAuthAtom } from "@/context/atoms/auth"
import { jotaiStore } from "@/context/store"
import type { AccessTokenResponse } from "@/types/api/auth"

// Part 8 §8.11 — 401 handling. Two guards are essential here:
//   1. Never retry the refresh endpoint itself, or a failed refresh recurses.
//   2. Retry each request at most once (`_retried`), or a persistently-401ing
//      endpoint loops forever.
// Concurrent 401s share ONE refresh call via `refreshPromise` — without this,
// a dashboard firing several parallel queries on token expiry triggers
// several simultaneous refreshes, several of which present an
// already-rotated token and trip the replay-detection in the backend
// (Part 8 §8.4), logging the user out for doing nothing wrong.

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

let refreshPromise: Promise<string> | null = null

async function performRefresh(instance: AxiosInstance): Promise<string> {
  const response = await instance.post<{ data: AccessTokenResponse }>("/auth/refresh")
  const token = response.data.data.accessToken
  jotaiStore.set(accessTokenAtom, token)
  return token
}

export function registerRefreshInterceptor(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as RetriableConfig | undefined

      if (error.response?.status !== 401 || !original || original._retried) {
        return Promise.reject(error)
      }

      if (original.url?.includes("/auth/refresh")) {
        jotaiStore.set(clearAuthAtom)
        return Promise.reject(error)
      }

      original._retried = true

      try {
        refreshPromise ??= performRefresh(instance).finally(() => {
          refreshPromise = null
        })
        await refreshPromise
        return await instance(original)
      } catch (refreshError) {
        jotaiStore.set(clearAuthAtom)
        return Promise.reject(refreshError)
      }
    }
  )
}
