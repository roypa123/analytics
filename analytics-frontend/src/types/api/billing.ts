// Mirrors app/schemas/billing.py (Part 12, revised again — Orders, not
// Subscriptions).

export interface SubscriptionStatus {
  status: string | null
  hasAccess: boolean
}

export interface StartCheckoutResponse {
  razorpayKeyId: string
  razorpayOrderId: string
  planName: string
  amountPaise: number
  currency: string
}

export interface ConfirmCheckoutRequest {
  razorpayPaymentId: string
  razorpayOrderId: string
  razorpaySignature: string
}
