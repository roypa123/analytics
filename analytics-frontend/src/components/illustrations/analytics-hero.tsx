import { motion, useReducedMotion } from "framer-motion"

interface AnalyticsHeroProps {
  className?: string
}

const BARS = [
  { x: 40, h: 70 },
  { x: 90, h: 110 },
  { x: 140, h: 60 },
  { x: 190, h: 140 },
  { x: 240, h: 95 },
]

const POINTS = [
  { cx: 40, cy: 150 },
  { cx: 90, cy: 100 },
  { cx: 140, cy: 170 },
  { cx: 190, cy: 70 },
  { cx: 240, cy: 120 },
]

const LAST_POINT = POINTS[POINTS.length - 1]

// Part 7 §7.17 — abstract chart-motif hero illustration. Generated SVG, no
// external image asset; themes automatically via currentColor + the brand
// gradient tokens so it never needs a light/dark variant shipped separately.
//
// Beyond the one-shot entrance, the card carries a low-amplitude idle life:
// a diagonal sheen sweep and a "live" ping on the latest data point, both
// looping so the illustration doesn't go inert once mounted. All of it is
// skipped under prefers-reduced-motion, rendering the settled end state.
export function AnalyticsHero({ className }: AnalyticsHeroProps) {
  const reduceMotion = useReducedMotion()

  return (
    <svg
      viewBox="0 0 340 260"
      className={className}
      role="img"
      aria-label="Abstract chart illustration"
    >
      <defs>
        <linearGradient id="heroGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-from)" />
          <stop offset="55%" stopColor="var(--brand-via)" />
          <stop offset="100%" stopColor="var(--brand-to)" />
        </linearGradient>
        <linearGradient id="heroGradientSoft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-via)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-via)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="heroSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="50%" stopColor="white" stopOpacity="0.25" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <clipPath id="heroCardClip">
          <rect x="8" y="8" width="324" height="244" rx="20" />
        </clipPath>
      </defs>

      <motion.rect
        x="8"
        y="8"
        width="324"
        height="244"
        rx="20"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="1"
        initial={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      {BARS.map((bar, i) => (
        <motion.rect
          key={bar.x}
          x={bar.x}
          width="34"
          rx="6"
          fill="url(#heroGradient)"
          y={220 - bar.h}
          height={bar.h}
          initial={reduceMotion ? undefined : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          style={{ transformOrigin: "bottom", transformBox: "fill-box" }}
          transition={{
            type: "spring",
            stiffness: 140,
            damping: 12,
            delay: 0.15 + i * 0.09,
          }}
        />
      ))}

      <motion.path
        d="M40 150 L90 100 L140 170 L190 70 L240 120"
        fill="none"
        stroke="url(#heroGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? undefined : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, delay: 0.5, ease: [0.65, 0, 0.35, 1] }}
      />

      <path
        d="M40 150 L90 100 L140 170 L190 70 L240 120 L240 220 L40 220 Z"
        fill="url(#heroGradientSoft)"
      />

      {POINTS.map((p, i) => (
        <motion.circle
          key={`${p.cx}-${p.cy}`}
          cx={p.cx}
          cy={p.cy}
          r="4.5"
          fill="var(--background)"
          stroke="var(--foreground)"
          strokeWidth="2"
          initial={reduceMotion ? undefined : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 14, delay: 1.4 + i * 0.06 }}
        />
      ))}

      {/* Live-data ping on the most recent point, looping */}
      {!reduceMotion && (
        <motion.circle
          cx={LAST_POINT.cx}
          cy={LAST_POINT.cy}
          r="4.5"
          fill="none"
          stroke="var(--brand-via)"
          strokeWidth="2"
          style={{ transformOrigin: `${LAST_POINT.cx}px ${LAST_POINT.cy}px` }}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0.6, 0], scale: [1, 2.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 1.9 }}
        />
      )}

      {/* Diagonal sheen sweep, clipped to the card, looping with a rest period */}
      {!reduceMotion && (
        <g clipPath="url(#heroCardClip)">
          <motion.rect
            x="0"
            y="0"
            width="90"
            height="260"
            fill="url(#heroSheen)"
            transform="skewX(-20)"
            initial={{ x: -160, opacity: 0 }}
            animate={{ x: [-160, 420], opacity: [0, 1, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 3.4, ease: "easeInOut", delay: 2.2 }}
          />
        </g>
      )}
    </svg>
  )
}
