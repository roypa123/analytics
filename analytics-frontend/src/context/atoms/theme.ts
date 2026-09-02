import { atomWithStorage } from "jotai/utils"

export type Theme = "light" | "dark" | "system"

// Persisted — a UI preference, not a secret (contrast with accessTokenAtom).
export const themeAtom = atomWithStorage<Theme>("theme", "system")
