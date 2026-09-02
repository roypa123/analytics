// Part 7 §7.12 — hand-written parsing primitives for untrusted input (URL
// search params, in particular). Exists because C-03 rules out Zod; each
// function is pure, dependency-free, and narrows `unknown` to a real type
// instead of casting it.

// Shared with react-hook-form's `pattern` rule on auth forms (Rule R-14):
// a frontend-side format check, independent of and no substitute for the
// backend's authoritative `EmailStr` validation (Part 4 §4.13).
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function asOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number]
): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback
}

export function asOneOfOptional<T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function asIsoDate(value: unknown): string | undefined {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) ? value : undefined
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function asInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}
