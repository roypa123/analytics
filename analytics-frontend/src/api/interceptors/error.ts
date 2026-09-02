import axios, { type AxiosError } from "axios"

import type { ApiErrorBody } from "@/types/api/common"
import { ApiError } from "@/api/errors"

// Part 7 §7.5 — response interceptor (rejection path): normalize every axios
// failure into one ApiError type. Cancellation MUST pass through unchanged —
// TanStack Query cancels in-flight requests on every query-key change (e.g.
// a date-range edit), and converting that into an ApiError would surface a
// "network error" toast during completely normal interaction. This is the
// most common axios + TanStack Query integration bug.
export function normalizeError(error: unknown): never {
  if (axios.isCancel(error)) {
    throw error
  }

  const axiosError = error as AxiosError<{ error: ApiErrorBody }>

  if (axiosError.code === "ECONNABORTED") {
    throw new ApiError(
      { code: "timeout", message: "The request timed out.", details: [], requestId: null },
      null
    )
  }

  if (!axiosError.response) {
    throw new ApiError(
      { code: "network_error", message: "Network error.", details: [], requestId: null },
      null
    )
  }

  const body = axiosError.response.data?.error
  if (!body) {
    throw new ApiError(
      {
        code: "unexpected_response",
        message: "The server returned an unexpected response.",
        details: [],
        requestId: null,
      },
      axiosError.response.status
    )
  }

  throw new ApiError(body, axiosError.response.status)
}
