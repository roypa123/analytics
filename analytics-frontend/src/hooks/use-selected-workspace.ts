import { useAtom } from "jotai"

import { selectedWorkspaceIdAtom } from "@/context/atoms/workspace"
import { useWorkspaces } from "@/hooks/queries/use-workspaces"
import type { WorkspaceSummary } from "@/types/api/workspace"

interface UseSelectedWorkspaceResult {
  workspace: WorkspaceSummary | undefined
  workspaces: WorkspaceSummary[]
  isLoading: boolean
  selectWorkspaceId: (workspaceId: number) => void
}

// An account can belong to more than one workspace — its own, auto-created
// at signup, plus any it's since been invited into (Part 8 §8.8). Settings
// used to just take `workspaces[0]` (ordered by `joined_at`), which meant an
// invited teammate — who registers before accepting, so their own solo
// workspace is always the oldest membership — landed on their empty personal
// workspace instead of the org they were actually invited to manage; an
// admin there would correctly see no "Invite" button, because on that
// workspace they really are the sole owner with no team to manage. The
// default here prefers an organisation workspace over a personal one for
// exactly that reason. Explicit selection (via the switcher) always wins
// once made.
export function useSelectedWorkspace(): UseSelectedWorkspaceResult {
  const { data, isLoading } = useWorkspaces()
  const workspaces = data ?? []
  const [selectedId, setSelectedId] = useAtom(selectedWorkspaceIdAtom)

  const selected = selectedId != null ? workspaces.find((w) => w.id === selectedId) : undefined
  const defaultWorkspace = workspaces.find((w) => w.isOrganisation) ?? workspaces[0]

  return {
    workspace: selected ?? defaultWorkspace,
    workspaces,
    isLoading,
    selectWorkspaceId: setSelectedId,
  }
}
