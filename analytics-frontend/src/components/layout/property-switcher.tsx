import { Globe } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSelectedProperty } from "@/hooks/use-selected-property"

// Lives in the app header (Part 7 §7.10) so it's visible on every
// property-scoped page. Renders nothing with zero or one property — a
// single-option dropdown has nothing to switch between, so it would only add
// clutter for the common one-property account.
export function PropertySwitcher() {
  const { property, properties, isLoading, selectPropertyId } = useSelectedProperty()

  if (isLoading || properties.length < 2) {
    return null
  }

  return (
    <Select
      value={property ? String(property.id) : undefined}
      onValueChange={(value) => selectPropertyId(Number(value))}
    >
      <SelectTrigger className="w-56" size="sm">
        <Globe className="size-4 text-muted-foreground" />
        <SelectValue placeholder="Select a property" />
      </SelectTrigger>
      <SelectContent>
        {properties.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            <span className="truncate">{p.name}</span>
            <span className="text-xs text-muted-foreground">{p.domain}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
