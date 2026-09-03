// Part 7 §7.13 — validated once at import time, so a missing/malformed env
// var fails loudly at boot rather than producing a request to
// `undefined/api/v1/...` at runtime (mirrors the backend rule, Part 4 §4.7).
// Hand-written per project constraint C-03 (no Zod).

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = Object.freeze({
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),
  // The collector deployable (D-05) is a separate origin from the API, and
  // its public URL is embedded verbatim into the tracking snippet shown on
  // the onboarding "install snippet" page — it differs per environment
  // (local/staging/prod) the same way apiBaseUrl does, so it gets the same
  // required-env-var treatment rather than a hardcoded localhost fallback.
  collectorUrl: required("VITE_COLLECTOR_URL", import.meta.env.VITE_COLLECTOR_URL),
  environment: (import.meta.env.VITE_ENVIRONMENT ?? "local") as
    | "local"
    | "staging"
    | "production",
})
