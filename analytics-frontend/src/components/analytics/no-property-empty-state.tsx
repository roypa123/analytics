import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { Globe, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cardVariants, iconPop } from "@/lib/motion"

// Shared across every property-scoped page (dashboard, reports, realtime) so
// the "nothing to show yet" state reads identically wherever it appears.
export function NoPropertyEmptyState() {
  return (
    <motion.div variants={cardVariants} whileHover="hover" className="cursor-default">
      <Empty className="border bg-gradient-to-b from-muted/40 to-transparent py-16">
        <EmptyHeader>
          <motion.div variants={iconPop}>
            <EmptyMedia
              variant="icon"
              className="mb-1 size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-6"
            >
              <Globe />
            </EmptyMedia>
          </motion.div>
          <EmptyTitle className="text-base">Create your first property</EmptyTitle>
          <EmptyDescription>
            Add a website to start seeing sessions, pageviews, and conversions —
            it only takes a minute.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link to="/onboarding/property" />} size="lg">
            <Plus className="size-4" />
            New property
          </Button>
        </EmptyContent>
      </Empty>
    </motion.div>
  )
}
