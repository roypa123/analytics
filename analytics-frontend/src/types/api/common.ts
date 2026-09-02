// Part 7 §7.13 — mirrors the backend's Part 4 §4.10 envelope exactly.
// `types/` emits zero JavaScript (Rule R-05): types only.

export interface ErrorDetail {
  field?: string
  issue: string
}

export interface ApiErrorBody {
  code: string
  message: string
  details: ErrorDetail[]
  requestId: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
