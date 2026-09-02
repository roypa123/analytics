import { cn } from "@/lib/utils"

interface GridGlowProps {
  className?: string
}

// Part 7 §7.17 — a subtle dotted-grid backdrop with a radial brand glow.
// Purely CSS (no motion) since it sits behind static, text-heavy surfaces
// like the auth pages, where a busy background would hurt legibility.
export function GridGlow({ className }: GridGlowProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      aria-hidden="true"
      style={{
        backgroundImage:
          "radial-gradient(var(--border) 1px, transparent 1px), radial-gradient(circle at 50% 0%, var(--brand-via) 0%, transparent 55%)",
        backgroundSize: "24px 24px, 100% 100%",
        opacity: 0.5,
      }}
    />
  )
}
