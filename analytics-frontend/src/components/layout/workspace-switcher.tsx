import { Building2 } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSelectedWorkspace } from "@/hooks/use-selected-workspace"

// Settings-only (unlike PropertySwitcher, which lives in the app header) —
// workspace membership is rare enough today (D-25: one workspace per account
// until an invitation changes that) that surfacing it everywhere would be
// clutter. Renders nothing with zero or one workspace.
export function WorkspaceSwitcher() {
  const { workspace, workspaces, isLoading, selectWorkspaceId } = useSelectedWorkspace()

  if (isLoading || workspaces.length < 2) {
    return null
  }

  return (
    <Select
      value={workspace ? String(workspace.id) : undefined}
      onValueChange={(value) => selectWorkspaceId(Number(value))}
    >
      <SelectTrigger className="w-56" size="sm">
        <Building2 className="size-4 text-muted-foreground" />
        <SelectValue placeholder="Select a workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((w) => (
          <SelectItem key={w.id} value={String(w.id)}>
            <span className="truncate">{w.name}</span>
            <span className="text-xs text-muted-foreground">{w.myRole}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
