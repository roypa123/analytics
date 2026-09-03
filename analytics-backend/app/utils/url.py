"""Part 1 §1.5 "Page context"/"Campaign context" — normalize the client's raw
URLs into the columns reports actually group by. Done once at ingest, never at
query time, per the same reasoning as `page_path` in Part 3 §3.3."""

from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit


@dataclass(frozen=True)
class PageContext:
    path: str | None
    query: str | None
    hostname: str | None
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None
    utm_term: str | None
    utm_content: str | None


@dataclass(frozen=True)
class ReferrerContext:
    domain: str | None
    path: str | None


def parse_page_url(page_url: str) -> PageContext:
    try:
        parts = urlsplit(page_url)
    except ValueError:
        return PageContext(None, None, None, None, None, None, None, None)

    query_params = parse_qs(parts.query)

    def first(key: str) -> str | None:
        values = query_params.get(key)
        return values[0] if values else None

    return PageContext(
        path=parts.path or "/",
        query=parts.query or None,
        hostname=parts.hostname,
        utm_source=first("utm_source"),
        utm_medium=first("utm_medium"),
        utm_campaign=first("utm_campaign"),
        utm_term=first("utm_term"),
        utm_content=first("utm_content"),
    )


def parse_referrer_url(referrer_url: str | None, page_hostname: str | None) -> ReferrerContext:
    if not referrer_url:
        return ReferrerContext(None, None)
    try:
        parts = urlsplit(referrer_url)
    except ValueError:
        return ReferrerContext(None, None)
    if not parts.hostname:
        return ReferrerContext(None, None)
    # Same-site referrers (internal navigation) are not "traffic sources."
    if page_hostname and parts.hostname == page_hostname:
        return ReferrerContext(None, None)
    return ReferrerContext(domain=parts.hostname, path=parts.path or "/")
