import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { BarChart3, Globe2, ShieldCheck, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AnalyticsHero } from "@/components/illustrations/analytics-hero"
import { BlobBackground } from "@/components/illustrations/blob-background"
import { fadeUp, staggerContainer } from "@/lib/motion"

const FEATURES = [
  {
    icon: BarChart3,
    title: "Real-time reporting",
    description: "Sessions, pageviews, and conversions as they happen, not tomorrow's batch job.",
  },
  {
    icon: Globe2,
    title: "Cookieless by default",
    description: "Privacy-respecting visitor identity with no consent banner required.",
  },
  {
    icon: ShieldCheck,
    title: "Per-property access",
    description: "Invite teammates to exactly the properties they need — nothing more.",
  },
  {
    icon: Zap,
    title: "One line to install",
    description: "Drop in a single script tag and events start flowing immediately.",
  },
] as const

// Part 7 §7.12, §7.17 — the public landing page at "/", a sibling of
// loginRoute on rootRoute rather than a child of the authenticated appRoute.
export function LandingPage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <BlobBackground className="opacity-70" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-lg font-semibold tracking-tight">Analytics</span>
        <Button render={<Link to="/login" />} variant="ghost">
          Sign in
        </Button>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-2 lg:py-24">
          <motion.div
            initial="hidden"
            animate="show"
            variants={staggerContainer}
            className="flex flex-col gap-6"
          >
            <motion.h1
              variants={fadeUp}
              className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
            >
              Website analytics that{" "}
              <span className="text-brand-gradient">respects your visitors</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="max-w-md text-lg text-muted-foreground">
              Understand traffic, conversions, and behavior across every property in your
              workspace — without third-party cookies and without the wait.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
              <Button render={<Link to="/login" />} size="lg">
                Get started
              </Button>
              <Button render={<Link to="/login" />} size="lg" variant="outline">
                Sign in
              </Button>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mx-auto w-full max-w-md"
          >
            <AnalyticsHero className="w-full drop-shadow-xl" />
          </motion.div>
        </section>

        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-6 pb-24 sm:px-10 md:grid-cols-2 lg:grid-cols-4"
        >
          {FEATURES.map((feature) => (
            <motion.div key={feature.title} variants={fadeUp}>
              <Card className="h-full">
                <CardHeader>
                  <feature.icon className="size-8 text-primary" strokeWidth={1.5} />
                  <CardTitle className="pt-2 text-base">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.section>
      </main>

      <footer className="relative z-10 border-t px-6 py-6 text-center text-sm text-muted-foreground sm:px-10">
        © {new Date().getFullYear()} Analytics. All rights reserved.
      </footer>
    </div>
  )
}
