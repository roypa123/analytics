import { useAtom } from "jotai"

import { selectedPropertyIdAtom } from "@/context/atoms/property"
import { useProperties } from "@/hooks/queries/use-properties"
import type { PropertySummary } from "@/types/api/property"

interface UseSelectedPropertyResult {
  property: PropertySummary | undefined
  properties: PropertySummary[]
  isLoading: boolean
  selectPropertyId: (propertyId: number) => void
}

// Single source of truth for "which property is the user looking at" across
// every property-scoped page (dashboard, reports, realtime) — they used to
// each independently take `properties[0]`, so adding a second property had
// nowhere to switch to it from. Falls back to the first property whenever
// nothing is explicitly selected yet, or the previously-selected one is gone
// (deleted, or no longer visible to this account).
export function useSelectedProperty(): UseSelectedPropertyResult {
  const { data, isLoading } = useProperties()
  const properties = data ?? []
  const [selectedId, setSelectedId] = useAtom(selectedPropertyIdAtom)

  const property =
    (selectedId != null ? properties.find((p) => p.id === selectedId) : undefined) ??
    properties[0]

  return { property, properties, isLoading, selectPropertyId: setSelectedId }
}
