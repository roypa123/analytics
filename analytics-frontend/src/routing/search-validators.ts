// Part 7 §7.12 — hand-written route search validators (C-03: no Zod).
// TanStack Router's `validateSearch` contract is `(input: unknown) => T`,
// so type safety flows from the return annotation regardless of how the
// parsing is authored.

import { asString } from "@/utils/validation"

export interface LoginSearch {
  redirect?: string
}

export function validateLoginSearch(input: Record<string, unknown>): LoginSearch {
  const redirect = asString(input.redirect)
  // Only accept a same-origin relative path — never hand an open redirect
  // target to `navigate()` (Part 7 §7.12).
  return { redirect: redirect?.startsWith("/") ? redirect : undefined }
}

export interface InstallSnippetSearch {
  trackingId?: string
}

// Carries the just-created property's tracking id from the create-property
// step to the install-snippet step without a second fetch. Falls back to
// `useProperties()` in the page itself if this is empty (e.g. a direct visit).
export function validateInstallSnippetSearch(
  input: Record<string, unknown>
): InstallSnippetSearch {
  return { trackingId: asString(input.trackingId) }
}
