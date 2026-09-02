import type { Transition, Variants } from "framer-motion"

// Part 7 §7.17 — shared animation vocabulary. One definition per effect,
// reused across pages/marketing, pages/auth, and pages/dashboard rather than
// inlined ad hoc per component.

export const springTransition: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 24,
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: springTransition },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4, ease: "easeOut" } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: springTransition },
}

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
}

// Bouncier than fadeUp/scaleIn on purpose — used for elements the user is
// meant to feel respond to them (metric cards, interactive tiles), not for
// page-level entrances where restraint reads as more premium.
export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 20, mass: 0.7 },
  },
  hover: {
    y: -6,
    scale: 1.015,
    transition: { type: "spring", stiffness: 300, damping: 18 },
  },
}

export const cardTap = { scale: 0.985 }

// Inherits the "hover"/"show" label from an ancestor's `variants` — no
// `initial`/`animate` of its own — so an icon nested in a `cardVariants`
// card pops in on mount and tilts on hover for free.
export const iconPop: Variants = {
  hidden: { opacity: 0, scale: 0.5, rotate: -8 },
  show: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: "spring", stiffness: 380, damping: 16, delay: 0.1 },
  },
  hover: { scale: 1.15, rotate: 6, transition: { type: "spring", stiffness: 300, damping: 12 } },
}
