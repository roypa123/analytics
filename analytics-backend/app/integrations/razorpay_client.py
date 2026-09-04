"""Part 12 (revised) — a thin async wrapper over Razorpay's REST API.

No async SDK exists for Razorpay (the official `razorpay` package wraps
`requests`, which blocks the event loop), so this mirrors `app/utils/geoip.py`'s
own-small-httpx-client pattern rather than adding a sync dependency.

Authentication is HTTP Basic (key_id as username, key_secret as password) —
Razorpay's API does not use bearer tokens.

`verify=truststore.SSLContext(...)` below is load-bearing, not decorative:
Razorpay's certificate chain relies on the OS doing AIA (Authority
Information Access) chasing to complete it, which curl/browsers do and
Python's own `ssl`/`certifi` stack does not — plain `httpx` fails every
request here with `CERTIFICATE_VERIFY_FAILED: unable to get local issuer
certificate` even though the chain is genuinely valid (same root cause
`app/utils/geoip.py` hit; unlike that HTTP API, a payments API can't be
worked around by dropping to plain HTTP). `truststore` delegates certificate
verification to the OS trust store instead of bundled `certifi`, which is
where the OS's own AIA-completed chain already lives.
"""

import hashlib
import hmac
import ssl
from typing import Any

import httpx
import truststore

from app.core.config import RazorpaySettings

_BASE_URL = "https://api.razorpay.com/v1"
_TIMEOUT_SECONDS = 15.0


def _ssl_context() -> ssl.SSLContext:
    return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


class RazorpayClient:
    def __init__(self, settings: RazorpaySettings) -> None:
        self._auth = (settings.key_id, settings.key_secret)
        self._webhook_secret = settings.webhook_secret
        self._key_secret = settings.key_secret

    async def create_plan(
        self, *, name: str, amount_paise: int, currency: str = "INR"
    ) -> dict[str, Any]:
        """One-time setup call (scripts/razorpay_setup.py), not something the
        app calls at request time — Razorpay has no "get or create" for
        plans, so re-running this creates a duplicate plan rather than
        reusing one."""
        async with httpx.AsyncClient(
            base_url=_BASE_URL, auth=self._auth, timeout=_TIMEOUT_SECONDS, verify=_ssl_context()
        ) as client:
            response = await client.post(
                "/plans",
                json={
                    "period": "monthly",
                    "interval": 1,
                    "item": {"name": name, "amount": amount_paise, "currency": currency},
                },
            )
            response.raise_for_status()
            return dict(response.json())

    async def create_subscription(
        self, *, plan_id: str, total_count: int, notes: dict[str, str]
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(
            base_url=_BASE_URL, auth=self._auth, timeout=_TIMEOUT_SECONDS, verify=_ssl_context()
        ) as client:
            response = await client.post(
                "/subscriptions",
                json={
                    "plan_id": plan_id,
                    "total_count": total_count,
                    "quantity": 1,
                    "customer_notify": True,
                    "notes": notes,
                },
            )
            response.raise_for_status()
            return dict(response.json())

    async def fetch_subscription(self, razorpay_subscription_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(
            base_url=_BASE_URL, auth=self._auth, timeout=_TIMEOUT_SECONDS, verify=_ssl_context()
        ) as client:
            response = await client.get(f"/subscriptions/{razorpay_subscription_id}")
            response.raise_for_status()
            return dict(response.json())

    def verify_webhook_signature(self, *, raw_body: bytes, signature: str) -> bool:
        """Part 12 §12.2 — HMAC-SHA256 over the *raw* request body (never the
        parsed/re-serialized JSON, which is not guaranteed byte-identical),
        keyed by the webhook secret configured in the Razorpay dashboard."""
        expected = hmac.new(
            self._webhook_secret.encode(), raw_body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def verify_checkout_signature(
        self, *, razorpay_payment_id: str, razorpay_subscription_id: str, signature: str
    ) -> bool:
        """The signature Razorpay Checkout hands the browser on success — a
        provisional, client-reported confirmation (Part 12 §12.7). Verified
        here so the frontend can show "payment received" immediately, but the
        webhook remains the source of truth for `status`, since a checkout
        callback can be spoofed or simply never fire (tab closed mid-flow)."""
        payload = f"{razorpay_payment_id}|{razorpay_subscription_id}".encode()
        expected = hmac.new(self._key_secret.encode(), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)
