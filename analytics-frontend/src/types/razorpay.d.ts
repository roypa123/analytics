// Minimal shape for Razorpay's Checkout.js — loaded at runtime from
// https://checkout.razorpay.com/v1/checkout.js (pages/billing/subscribe-page.tsx),
// not an npm package, so there's no upstream type package to depend on
// instead. Orders-based (order_id + amount + currency), not
// subscription-based — see app/integrations/razorpay_client.py for why.

interface RazorpayCheckoutOptions {
  key: string
  order_id: string
  amount: number
  currency: string
  name: string
  description?: string
  theme?: { color?: string }
  handler: (response: {
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
  }) => void
  modal?: {
    ondismiss?: () => void
  }
}

interface RazorpayCheckoutInstance {
  open: () => void
}

interface Window {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance
}
