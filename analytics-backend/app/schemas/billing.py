"""Part 12 (revised again: Orders, not Subscriptions) — billing status and
Checkout handoff."""

from pydantic import Field

from app.schemas.common import CamelModel


class SubscriptionStatusResponse(CamelModel):
    # None means "no billing row yet" — a brand-new workspace, or one that
    # never started checkout. "pending"/"active"/"expired" otherwise.
    status: str | None
    has_access: bool


class StartCheckoutResponse(CamelModel):
    # Everything Razorpay Checkout.js needs client-side for an Orders-based
    # (not Subscriptions-based) checkout — key, order, and the amount/currency
    # to display, since an Order carries no separate Plan to look those up on.
    razorpay_key_id: str
    razorpay_order_id: str
    plan_name: str
    amount_paise: int
    currency: str


class ConfirmCheckoutRequest(CamelModel):
    razorpay_payment_id: str = Field(min_length=1)
    razorpay_order_id: str = Field(min_length=1)
    razorpay_signature: str = Field(min_length=1)
