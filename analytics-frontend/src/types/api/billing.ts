// Mirrors app/schemas/billing.py (Part 12, revised — no free tier).

export interface SubscriptionStatus {
  status: string | null
  hasAccess: boolean
}

export interface StartSubscriptionResponse {
  razorpayKeyId: string
  razorpaySubscriptionId: string
  planName: string
  amountPaise: number
  currency: string
}

export interface ConfirmCheckoutRequest {
  razorpayPaymentId: string
  razorpaySubscriptionId: string
  razorpaySignature: string
}
