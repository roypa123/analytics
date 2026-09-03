import { atomWithStorage } from "jotai/utils"

// Persisted — which property to view is a per-browser UI preference, not
// per-session state. `useSelectedProperty` (hooks/use-selected-property.ts)
// is the only place that should read/write this; it falls back to the first
// property whenever this id is null or no longer in the account's list
// (nothing selected yet, or the selected property was deleted).
export const selectedPropertyIdAtom = atomWithStorage<number | null>("selectedPropertyId", null)
