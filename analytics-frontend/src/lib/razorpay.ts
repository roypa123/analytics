const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js"

let loadPromise: Promise<void> | null = null

// Razorpay Checkout ships only as a global `<script>` (no npm package worth
// depending on for one constructor), loaded on demand — only the Subscribe
// page pays for it, not every route. Cached in module scope so navigating to
// /subscribe twice in one session doesn't inject the tag twice.
export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve()
  }
  loadPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout."))
    document.body.appendChild(script)
  })
  return loadPromise
}
