import { atom } from "jotai"

// Part 8 §8.4, D-20 — the access token lives ONLY in memory. Deliberately
// NOT atomWithStorage: persisting it to localStorage would let any XSS
// exfiltrate a long-lived credential (Part 7 §7.9).
export const accessTokenAtom = atom<string | null>(null)

export const isAuthenticatedAtom = atom((get) => get(accessTokenAtom) !== null)

// Write-only action atom (Part 7 §7.9) — defines "log out" once rather than
// duplicating token-clearing logic at every call site.
export const clearAuthAtom = atom(null, (_get, set) => {
  set(accessTokenAtom, null)
})
