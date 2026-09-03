import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { buildTrackingSnippet } from "@/utils/tracking-snippet"

interface TrackingSnippetBlockProps {
  trackingId: string
}

// Shared by the onboarding install-snippet step and the Settings "view
// snippet" dialog, so the copy-to-clipboard snippet card looks and behaves
// identically wherever a property's tracking ID needs to be handed to a user.
export function TrackingSnippetBlock({ trackingId }: TrackingSnippetBlockProps) {
  const [copied, setCopied] = useState(false)
  const snippet = buildTrackingSnippet(trackingId)

  const onCopy = async () => {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
          <code>{snippet}</code>
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
        Tracking ID: <code className="text-foreground">{trackingId}</code>
      </p>
    </div>
  )
}
