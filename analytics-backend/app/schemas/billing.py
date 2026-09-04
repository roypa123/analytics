"""Part 12 (revised) — billing status and Checkout handoff."""

from pydantic import Field

from app.schemas.common import CamelModel


class SubscriptionStatusResponse(CamelModel):
    # None means "no subscription row yet" — a brand-new workspace, or one
    # that never started checkout. Distinct from a Razorpay status string so
    # the frontend can tell "never started" from "started but not active".
    status: str | None
    has_access: bool


class StartSubscriptionResponse(CamelModel):
    # Everything Razorpay Checkout.js needs client-side (Part 12 §12.2 — the
    # embedded flow, not the hosted `short_url`, since we want the result
    # back in-app rather than a redirect round-trip).
    razorpay_key_id: str
    razorpay_subscription_id: str
    plan_name: str
    amount_paise: int
    currency: str


class ConfirmCheckoutRequest(CamelModel):
    razorpay_payment_id: str = Field(min_length=1)
    razorpay_subscription_id: str = Field(min_length=1)
    razorpay_signature: str = Field(min_length=1)
