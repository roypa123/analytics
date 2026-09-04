"""Part 12 (revised) — one-time Razorpay Plan creation.

Razorpay has no "get or create plan by name" call, so this is a manual,
one-time step rather than something the app runs on every boot: create the
plan once, then paste its id into RAZORPAY__PLAN_ID in .env.

    python -m scripts.razorpay_setup
"""

import asyncio

from app.core.config import get_settings
from app.integrations.razorpay_client import RazorpayClient


async def main() -> None:
    settings = get_settings()
    client = RazorpayClient(settings.razorpay)
    plan = await client.create_plan(
        name=settings.razorpay.plan_name,
        amount_paise=settings.razorpay.plan_amount_paise,
    )
    print(f"Created Razorpay plan: {plan['id']}")
    print(f"Amount: {plan['item']['amount'] / 100:.2f} {plan['item']['currency']} / month")
    print()
    print(f"Paste this into analytics-backend/.env:\n  RAZORPAY__PLAN_ID={plan['id']}")


if __name__ == "__main__":
    asyncio.run(main())
