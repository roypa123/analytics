import { motion } from "framer-motion"

import { RealtimePulse } from "@/components/analytics/realtime/realtime-pulse"

interface RealtimeCounterProps {
  count: number
  label?: string
}

// Part 7 §7.10 — `analytics/realtime/realtime-counter.tsx`. Presentational:
// takes the count as a prop, renders nothing on its own (Rule R-04's
// composition rule) beyond the number, label, and live-pulse dot.
export function RealtimeCounter({ count, label = "Visitors right now" }: RealtimeCounterProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
      <div className="flex items-center gap-2">
        <RealtimePulse active={count > 0} />
        <motion.span
          key={count}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl font-semibold tabular-nums"
        >
          {count}
        </motion.span>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
