import { atomWithStorage } from "jotai/utils"

// Persisted — which workspace Settings operates on is a per-browser UI
// preference, not per-session state. `useSelectedWorkspace`
// (hooks/use-selected-workspace.ts) is the only place that should read/write
// this; it falls back to a heuristic default whenever this id is null or no
// longer in the account's list (nothing selected yet, or membership ended).
export const selectedWorkspaceIdAtom = atomWithStorage<number | null>("selectedWorkspaceId", null)
