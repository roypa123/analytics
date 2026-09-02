import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { Activity, MousePointerClick, Plus, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useProperties } from "@/hooks/queries/use-properties"
import { cardTap, cardVariants, fadeUp, iconPop, staggerContainer } from "@/lib/motion"

const PLACEHOLDER_METRICS = [
  { label: "Sessions", value: "—", icon: Users },
  { label: "Pageviews", value: "—", icon: Activity },
  { label: "Conversions", value: "—", icon: MousePointerClick },
] as const

// Placeholder for the Tier-1 overview (Part 1 §1.2). Proves the auth
// vertical slice end-to-end: protected route → authenticated request →
// account data rendered. Metric cards are visual scaffolding — real data
// arrives with the reporting API (Part 1 §1.11). Header/sign-out now live in
// AppShell (Part 7 §7.10), so this page owns only its own content.
export function DashboardPage() {
  const { data: properties, isLoading: isLoadingProperties } = useProperties()
  const hasProperty = (properties?.length ?? 0) > 0

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex flex-col gap-6 p-6"
    >
      <motion.h1 variants={fadeUp} className="text-xl font-semibold">
        Dashboard
      </motion.h1>

      {isLoadingProperties ? (
        <Skeleton className="h-32 w-full" />
      ) : !hasProperty ? (
        <motion.div variants={fadeUp}>
          <Card className="items-center gap-3 py-10 text-center">
            <CardHeader>
              <CardTitle>Create your first property</CardTitle>
              <CardDescription>
                Add a website to start seeing sessions, pageviews, and conversions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button render={<Link to="/onboarding/property" />}>
                <Plus className="size-4" />
                New property
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLACEHOLDER_METRICS.map((metric) => (
            <motion.div
              key={metric.label}
              variants={cardVariants}
              whileHover="hover"
              whileTap={cardTap}
              className="cursor-default"
            >
              <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardDescription>{metric.label}</CardDescription>
                  <motion.span variants={iconPop} className="text-muted-foreground">
                    <metric.icon className="size-4" strokeWidth={1.5} />
                  </motion.span>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-2xl">{metric.value}</CardTitle>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
