// One-off precompute step (README: "Precomputing the map") for
// `analytics/realtime/realtime-map.tsx`. Building the world's dot grid from
// scratch needs @turf/boolean-point-in-polygon to test each candidate dot
// against every country's polygon — expensive, and pointless to redo on
// every page load. This writes the precomputed grid to a static JSON asset;
// the component then loads it through `dotted-map/without-countries`, which
// skips that step (it still needs `proj4` at runtime, for lat/lng -> grid
// projection when placing pins). Re-run only if the map resolution/grid
// style changes.
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import dottedMap from "dotted-map"

const { getMapJSON } = dottedMap

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(__dirname, "../src/assets/world-dot-map.json")

const mapJson = getMapJSON({ height: 60, grid: "diagonal" })
writeFileSync(outPath, mapJson)

console.log(`Wrote ${outPath} (${(mapJson.length / 1024).toFixed(1)} KB)`)
