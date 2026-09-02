import { Link, useNavigate } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Logo } from "@/components/illustrations/logo"
import { useProperties } from "@/hooks/queries/use-properties"
import { fadeUp } from "@/lib/motion"
import { installSnippetRoute } from "@/routing/routes/onboarding/install-snippet.route"

function buildSnippet(trackingId: string): string {
  return `<script defer src="https://cdn.nexlytics.io/tracker.js" data-tracking-id="${trackingId}"></script>`
}

// Part 8 §8.8 — the last onboarding step: "create first property → tracking
// snippet → install verification." Verification (waiting for the first real
// event to arrive) is not implemented yet — that needs the collector's
// ingestion path wired to a live check, tracked as future work alongside the
// rest of Part 8's still-pending pieces. This step ends at "here is your
// snippet," not "we've confirmed it's installed."
export function InstallSnippetPage() {
  const navigate = useNavigate()
  const search = installSnippetRoute.useSearch()
  const { data: properties, isLoading } = useProperties()
  const [copied, setCopied] = useState(false)

  const property = search.trackingId
    ? properties?.find((p) => p.trackingId === search.trackingId)
    : properties?.[0]

  const onCopy = async () => {
    if (!property) return
    await navigator.clipboard.writeText(buildSnippet(property.trackingId))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeUp} className="w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Install the tracking snippet</CardTitle>
            <CardDescription>
              {property
                ? `Add this to every page of ${property.domain}, just before the closing head tag.`
                : "Add this to every page of your site, just before the closing head tag."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : property ? (
              <>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
                    <code>{buildSnippet(property.trackingId)}</code>
                  </pre>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={onCopy}
                    aria-label="Copy snippet"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Tracking ID: <code className="text-foreground">{property.trackingId}</code>
                </p>
              </>
            ) : (
              <p className="text-sm text-destructive">
                No property found.{" "}
                <Link to="/onboarding/property" className="underline underline-offset-4">
                  Create one first
                </Link>
                .
              </p>
            )}
            <Button
              type="button"
              className="w-full"
              disabled={!property}
              onClick={() => void navigate({ to: "/dashboard" })}
            >
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
