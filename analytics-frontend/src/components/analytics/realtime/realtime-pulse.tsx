import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

interface RealtimePulseProps {
  active?: boolean
  className?: string
}

// Part 7 §7.10 — `analytics/realtime/realtime-pulse.tsx`. A live-status dot
// with an expanding ring, the same ping-loop motif as the marketing hero
// illustration (`illustrations/analytics-hero.tsx`) rather than a new one.
// `bg-primary` (a semantic token) stands in for a "live green" — the chart
// palette's categorical hues are still greyscale placeholders (§7.11, A-03),
// so there is no color token yet meant to carry status.
export function RealtimePulse({ active = true, className }: RealtimePulseProps) {
  const reduceMotion = useReducedMotion()

  return (
    <span className={cn("relative inline-flex size-2.5", className)}>
      {active && !reduceMotion && (
        <motion.span
          className="absolute inset-0 rounded-full bg-primary"
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: [0.6, 0], scale: [1, 2.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          active ? "bg-primary" : "bg-muted-foreground/40"
        )}
      />
    </span>
  )
}
