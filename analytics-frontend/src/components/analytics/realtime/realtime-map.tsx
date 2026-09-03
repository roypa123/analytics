import DottedMapImport from "dotted-map/without-countries"
import { useMemo } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { RealtimePulse } from "@/components/analytics/realtime/realtime-pulse"
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids"
import worldDotMapData from "@/assets/world-dot-map.json"

export interface ActiveCountry {
  countryCode: string // ISO 3166-1 alpha-2, matches `country_code char(2)` (Part 3 §3.3)
  count: number
}

interface RealtimeMapProps {
  activeCountries: ActiveCountry[]
}

// The world's dot grid never changes, so it's built once at module load
// rather than per render/mount — `scripts/generate-world-dot-map.mjs`
// already did the expensive part (testing every candidate dot against every
// country's polygon); this just replays the precomputed result.
//
// `dotted-map`'s UMD build double-wraps its ESM interop marker
// (`{ __esModule: true, default: <ctor> }`). Rollup (`vite build`) unwraps
// that extra layer automatically, but Vite dev's esbuild deps-prebundler
// does not — there, this default import resolves to the wrapper object
// itself, not the class, and `new DottedMap(...)` throws
// "DottedMap is not a constructor" the moment this module loads. Unwrap
// defensively so both environments get the real constructor.
const DottedMap = (
  DottedMapImport && typeof DottedMapImport === "object" && "default" in DottedMapImport
    ? (DottedMapImport as { default: typeof DottedMapImport }).default
    : DottedMapImport
) as typeof DottedMapImport

// The double cast is because `dotted-map`'s own `.d.ts` declares `points` as
// `Point[]`, but the JSON it actually serializes (and what the constructor
// actually reads at runtime) is a `Record<string, Point>` keyed by
// `"col;row"` — confirmed against the real output, not a guess.
type WorldMapData = ConstructorParameters<typeof DottedMap>[0]["map"]
const WORLD_MAP = new DottedMap({ map: worldDotMapData as unknown as WorldMapData })
const LAND_POINTS = WORLD_MAP.getPoints()
const { width: MAP_WIDTH, height: MAP_HEIGHT } = WORLD_MAP.image

// One <path> for every land dot instead of one <circle> per dot (~3,000 of
// them) — a single DOM node renders and repaints far more cheaply. Each dot
// is two semicircle arcs, the standard trick for drawing filled circles in
// one path `d` string.
const DOT_RADIUS = 0.35
const LAND_PATH = LAND_POINTS.map(({ x, y }) => {
  const d = DOT_RADIUS * 2
  return `M${x - DOT_RADIUS},${y}a${DOT_RADIUS},${DOT_RADIUS} 0 1,0 ${d},0a${DOT_RADIUS},${DOT_RADIUS} 0 1,0 ${-d},0`
}).join("")

// Part 7 §7.10 — `analytics/realtime/realtime-map.tsx`. The GA-style "live
// dot per active country" view. Presentational (Rule R-04): the page decides
// what counts as active and passes it in as `activeCountries`; a country
// code with no match in `COUNTRY_CENTROIDS` is silently dropped rather than
// crashing the page over a bad/unrecognized code.
//
// Pin placement reuses `dotted-map`'s own `addPin` projection (via a
// throwaway instance built from the same precomputed grid) instead of
// hand-rolling an equirectangular projection — it also snaps each pin onto
// the nearest land dot, which is what makes it read as part of the same map
// rather than floating above it.
export function RealtimeMap({ activeCountries }: RealtimeMapProps) {
  const pins = useMemo(() => {
    const pinMap = new DottedMap({ map: worldDotMapData as unknown as WorldMapData })
    return activeCountries
      .map((entry) => {
        const centroid = COUNTRY_CENTROIDS[entry.countryCode]
        if (!centroid) return null
        const { x, y } = pinMap.addPin({ lat: centroid.lat, lng: centroid.lng })
        return { ...entry, x, y, name: centroid.name }
      })
      .filter((pin): pin is NonNullable<typeof pin> => pin !== null)
  }, [activeCountries])

  return (
    <TooltipProvider>
      <div className="relative w-full" style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}>
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <path d={LAND_PATH} className="fill-muted-foreground/25" />
        </svg>

        {pins.map((pin) => (
          <Tooltip key={pin.countryCode}>
            <TooltipTrigger
              render={<span />}
              className="absolute inline-flex -translate-x-1/2 -translate-y-1/2 cursor-default"
              style={{ left: `${(pin.x / MAP_WIDTH) * 100}%`, top: `${(pin.y / MAP_HEIGHT) * 100}%` }}
            >
              <RealtimePulse />
            </TooltipTrigger>
            <TooltipContent>
              {pin.name} · {pin.count} active
            </TooltipContent>
          </Tooltip>
        ))}

        {pins.length === 0 && (
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">
            No active visitors right now.
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}
