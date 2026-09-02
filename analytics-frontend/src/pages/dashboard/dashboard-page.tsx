import { motion } from "framer-motion"
import { Activity, MousePointerClick, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentAccount } from "@/hooks/queries/use-current-account"
import { useLogout } from "@/hooks/mutations/use-logout"
import { cardTap, cardVariants, fadeUp, iconPop, staggerContainer } from "@/lib/motion"

const PLACEHOLDER_METRICS = [
  { label: "Sessions", value: "—", icon: Users },
  { label: "Pageviews", value: "—", icon: Activity },
  { label: "Conversions", value: "—", icon: MousePointerClick },
] as const

// Placeholder for the Tier-1 overview (Part 1 §1.2). Proves the auth
// vertical slice end-to-end: protected route → authenticated request →
// account data rendered. Metric cards are visual scaffolding — real data
// arrives with the reporting API (Part 1 §1.11).
export function DashboardPage() {
  const { data: account, isLoading } = useCurrentAccount()
  const logout = useLogout()

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex min-h-dvh flex-col gap-6 p-6"
    >
      <motion.header
        variants={fadeUp}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="truncate text-sm text-muted-foreground">
            {isLoading ? (
              <Skeleton className="mt-1 h-4 w-40" />
            ) : (
              `Signed in as ${account?.email}`
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="self-start sm:self-auto"
        >
          Sign out
        </Button>
      </motion.header>

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
    </motion.div>
  )
}
