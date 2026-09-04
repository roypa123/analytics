import { motion } from "framer-motion"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isApiError } from "@/api/errors"
import { useConfirmCheckout } from "@/hooks/mutations/use-confirm-checkout"
import { useStartCheckout } from "@/hooks/mutations/use-start-checkout"
import { useSubscriptionStatus } from "@/hooks/queries/use-subscription-status"
import { loadRazorpayCheckout } from "@/lib/razorpay"
import { fadeUp, staggerContainer } from "@/lib/motion"

type Stage = "idle" | "opening" | "confirming"

// Part 12 (revised again: Orders, not Subscriptions) — every other data
// route redirects an unpaid account here (`routing/guards.ts`'s
// `requireActiveSubscription`), but this page itself lives inside the
// normal app shell (linked from `AppSidebar`'s Billing item) rather than
// full-page like the onboarding wizard — the sidebar must stay reachable so
// an unpaid account can always get back here, not just on first redirect.
//
// One-time Order per billing period, not a Razorpay-managed recurring
// mandate (app/integrations/razorpay_client.py explains why) — a captured
// payment grants a fixed window of access, and the customer comes back here
// for a fresh checkout once it lapses.
export function SubscribePage() {
  const navigate = useNavigate()
  const { data: status } = useSubscriptionStatus()
  const startCheckout = useStartCheckout()
  const confirmCheckout = useConfirmCheckout()
  const [stage, setStage] = useState<Stage>("idle")

  const onSubscribe = () => {
    setStage("opening")
    startCheckout.mutate(undefined, {
      onSuccess: (result) => {
        void loadRazorpayCheckout().then(() => {
          if (!window.Razorpay) {
            setStage("idle")
            return
          }
          const checkout = new window.Razorpay({
            key: result.razorpayKeyId,
            order_id: result.razorpayOrderId,
            amount: result.amountPaise,
            currency: result.currency,
            name: result.planName,
            description: "30-day access",
            theme: { color: "#000000" },
            handler: (response) => {
              setStage("confirming")
              confirmCheckout.mutate(
                {
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpaySignature: response.razorpay_signature,
                },
                {
                  onSuccess: (confirmed) => {
                    if (confirmed.hasAccess) {
                      void navigate({ to: "/dashboard" })
                    } else {
                      // Checkout succeeded but the payment hasn't shown as
                      // captured yet — the webhook will catch up shortly;
                      // there's nothing more this page can do but say so.
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
  const hasError = isApiError(startCheckout.error) || isApiError(confirmCheckout.error)

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex flex-col gap-6 p-6"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your Nexlytics access.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} className="max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{status?.hasAccess ? "Access active" : "Pay to continue"}</CardTitle>
            <CardDescription>
              {status?.hasAccess
                ? "Your workspace's access is currently active."
                : status?.status === "pending"
                  ? "Your last payment didn't go through — try again to restore access."
                  : status?.status === "expired"
                    ? "Your access period has ended — pay again to continue."
                    : "A payment is required to use the rest of Nexlytics."}
            </CardDescription>
          </CardHeader>
          {!status?.hasAccess && (
            <CardContent className="flex flex-col gap-4">
              {hasError && (
                <p className="text-sm text-destructive">
                  Something went wrong starting checkout. Please try again.
                </p>
              )}
              <Button type="button" className="w-full sm:w-auto" disabled={isBusy} onClick={onSubscribe}>
                {stage === "confirming"
                  ? "Confirming payment…"
                  : stage === "opening"
                    ? "Opening checkout…"
                    : "Pay ₹999 for 30 days"}
              </Button>
            </CardContent>
          )}
        </Card>
      </motion.div>
    </motion.div>
  )
}
