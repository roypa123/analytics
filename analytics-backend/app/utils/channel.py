"""Part 1 §1.5 "Campaign context" — `channel_group` classification.

Computed at ingest, not query time (Part 1 §1.5: reclassification must be an
explicit, auditable backfill, not a moving target). Phase 1 uses a fixed
in-code rule set covering the standard channel taxonomy rather than the
documented referrer-domain lookup table (Part 5 §5.9) — there is no `dim_*`
table to seed yet, and the common-search/social-domain lists below cover the
traffic that actually needs classifying for a Tier-1 report. Promote to a
proper lookup table once custom per-workspace domain rules are needed.

Stored as `text` for Phase 1 (see `app/utils/user_agent.py` docstring on the
same simplification for `device_type`/`browser_name`/`os_name`).
"""

_SEARCH_DOMAINS = {
    "google", "bing", "yahoo", "duckduckgo", "baidu", "yandex", "ecosia",
}
_SOCIAL_DOMAINS = {
    "facebook", "instagram", "twitter", "x.com", "t.co", "linkedin", "pinterest",
    "reddit", "tiktok", "youtube", "threads.net",
}

_PAID_MEDIUMS = {"cpc", "ppc", "paidsearch", "paid-search", "paid_search"}
_DISPLAY_MEDIUMS = {"display", "banner", "cpm"}
_SOCIAL_MEDIUMS = {"social", "social-paid", "social_paid", "paidsocial"}
_EMAIL_MEDIUMS = {"email", "e-mail", "newsletter"}
_AFFILIATE_MEDIUMS = {"affiliate", "partner"}


def _registrable_label(domain: str) -> str:
    """`www.google.co.in` -> `google` — good enough for the fixed lists above
    without a public-suffix-list dependency."""
    labels = domain.lower().split(".")
    return labels[-2] if len(labels) >= 2 else labels[0]


def classify_channel(
    *,
    utm_source: str | None,
    utm_medium: str | None,
    referrer_domain: str | None,
) -> str:
    medium = (utm_medium or "").strip().lower()

    if medium in _PAID_MEDIUMS:
        return "Paid Search"
    if medium in _DISPLAY_MEDIUMS:
        return "Display"
    if medium in _SOCIAL_MEDIUMS:
        return "Social"
    if medium in _EMAIL_MEDIUMS:
        return "Email"
    if medium in _AFFILIATE_MEDIUMS:
        return "Affiliate"

    if utm_source:
        return "Other"  # a UTM source with an unrecognized medium — tagged, just not classifiable

    if not referrer_domain:
        return "Direct"

    label = _registrable_label(referrer_domain)
    if label in _SEARCH_DOMAINS:
        return "Organic Search"
    if label in _SOCIAL_DOMAINS:
        return "Social"
    return "Referral"
