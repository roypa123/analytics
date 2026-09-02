import type { ApiErrorBody } from "@/types/api/common"

// Part 7 §7.5 — every failure the app can encounter is normalized into this
// one type. Consumers branch on `code`, never on `message` text.
export class ApiError extends Error {
  readonly code: string
  readonly details: ApiErrorBody["details"]
  readonly requestId: string | null
  readonly status: number | null

  constructor(body: ApiErrorBody, status: number | null) {
    super(body.message)
    this.name = "ApiError"
    this.code = body.code
    this.details = body.details
    this.requestId = body.requestId
    this.status = status
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
