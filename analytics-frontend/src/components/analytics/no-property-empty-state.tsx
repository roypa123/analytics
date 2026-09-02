import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fadeUp } from "@/lib/motion"

// Shared across every property-scoped page (dashboard, reports, ...) so the
// "nothing to show yet" state reads identically wherever it appears.
export function NoPropertyEmptyState() {
  return (
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
  )
}
