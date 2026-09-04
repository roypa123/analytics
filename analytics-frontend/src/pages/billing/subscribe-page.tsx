import { useNavigate } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isApiError } from "@/api/errors"
import { Logo } from "@/components/illustrations/logo"
import { useConfirmCheckout } from "@/hooks/mutations/use-confirm-checkout"
import { useStartSubscription } from "@/hooks/mutations/use-start-subscription"
import { useSubscriptionStatus } from "@/hooks/queries/use-subscription-status"
import { loadRazorpayCheckout } from "@/lib/razorpay"
import { fadeUp } from "@/lib/motion"

type Stage = "idle" | "opening" | "confirming"

// Part 12 (revised: no free tier) — every workspace needs an active Razorpay
// subscription before it can reach anything else; `routing/guards.ts`'s
// `requireActiveSubscription` sends every blocked route here. Full-page like
// the onboarding wizard, not inside the app shell — there's nothing to put
// in a sidebar until this succeeds.
export function SubscribePage() {
  const navigate = useNavigate()
  const { data: status } = useSubscriptionStatus()
  const startSubscription = useStartSubscription()
  const confirmCheckout = useConfirmCheckout()
  const [stage, setStage] = useState<Stage>("idle")

  const onSubscribe = () => {
    setStage("opening")
    startSubscription.mutate(undefined, {
      onSuccess: (result) => {
        void loadRazorpayCheckout().then(() => {
          if (!window.Razorpay) {
            setStage("idle")
            return
          }
          const checkout = new window.Razorpay({
            key: result.razorpayKeyId,
            subscription_id: result.razorpaySubscriptionId,
            name: result.planName,
            description: "Monthly subscription",
            theme: { color: "#000000" },
            handler: (response) => {
              setStage("confirming")
              confirmCheckout.mutate(
                {
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySubscriptionId: response.razorpay_subscription_id,
                  razorpaySignature: response.razorpay_signature,
                },
                {
                  onSuccess: (confirmed) => {
                    if (confirmed.hasAccess) {
                      void navigate({ to: "/dashboard" })
                    } else {
                      // Checkout succeeded but Razorpay hasn't marked the
                      // subscription active/authenticated yet (Part 12
                      // §12.7) — the webhook will catch up shortly; there's
                      // nothing more this page can do but say so.
                      setStage("idle")
                    }
                  },
                  onError: () => setStage("idle"),
                }
              )
            },
            modal: { ondismiss: () => setStage("idle") },
          })
          checkout.open()
        })
      },
      onError: () => setStage("idle"),
    })
  }

  const isBusy = stage !== "idle"
  const hasError = isApiError(startSubscription.error) || isApiError(confirmCheckout.error)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeUp} className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Subscribe to continue</CardTitle>
            <CardDescription>
              {status?.status === "pending" || status?.status === "halted"
                ? "Your last payment didn't go through — try again to restore access."
                : "An active subscription is required to use Nexlytics."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {hasError && (
              <p className="text-sm text-destructive">
                Something went wrong starting checkout. Please try again.
              </p>
            )}
            <Button type="button" className="w-full" disabled={isBusy} onClick={onSubscribe}>
              {stage === "confirming"
                ? "Confirming payment…"
                : stage === "opening"
                  ? "Opening checkout…"
                  : "Subscribe"}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
