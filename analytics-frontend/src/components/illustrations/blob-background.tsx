import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

interface BlobBackgroundProps {
  className?: string
}

// Part 7 §7.17 — ambient decorative motion only. Reduced to a static frame
// under prefers-reduced-motion (checked once here, so every consumer of
// this component inherits the behavior for free).
export function BlobBackground({ className }: BlobBackgroundProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <motion.div
        className="absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand-from), transparent 70%)" }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 40, 0], y: [0, 30, 0] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-6rem] top-1/4 h-80 w-80 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand-via), transparent 70%)" }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, -30, 0], y: [0, 40, 0] }
        }
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand-to), transparent 70%)" }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 25, 0], y: [0, -25, 0] }
        }
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  )
}
