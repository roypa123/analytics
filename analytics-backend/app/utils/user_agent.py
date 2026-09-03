"""Part 1 §1.5 "Device context" — UA parsing at ingest.

Uses `ua-parser` (already a pinned dependency, per pyproject.toml) for
browser/OS family and version. Device type has no single authoritative
signal from `ua-parser`'s output, so this uses the standard token-based
heuristic (checking for "Mobi"/"iPad"/"Tablet" in the raw string) that most
UA-sniffing libraries fall back to for exactly this classification.

Part 3 §3.3 dictionary-encodes these as `smallint` referencing `dim_*` lookup
tables. Phase 1 stores them as plain `text` instead — no lookup-or-create
round trip on the write path, no dimension tables to seed — and defers the
encoding to a backfill once write volume actually makes the row-size saving
matter. See docs/architecture/05-ingestion-pipeline.md §5.4.
"""

from dataclasses import dataclass

from ua_parser import user_agent_parser

DeviceType = str  # "desktop" | "mobile" | "tablet" — not a Literal; see module docstring


@dataclass(frozen=True)
class ParsedUserAgent:
    device_type: DeviceType
    browser_name: str | None
    browser_version: str | None
    os_name: str | None
    os_version: str | None


def _classify_device_type(ua_string: str) -> DeviceType:
    if "iPad" in ua_string or "Tablet" in ua_string:
        return "tablet"
    if "Android" in ua_string and "Mobile" not in ua_string:
        return "tablet"
    if "Mobi" in ua_string:
        return "mobile"
    return "desktop"


def _version(parsed: dict[str, str | None]) -> str | None:
    parts = [parsed.get("major"), parsed.get("minor"), parsed.get("patch")]
    numbers = [p for p in parts if p is not None]
    return ".".join(numbers) if numbers else None


def parse_user_agent(ua_string: str) -> ParsedUserAgent:
    # `ua_parser`'s legacy `user_agent_parser` module ships no type stubs.
    browser = user_agent_parser.ParseUserAgent(ua_string)  # type: ignore[no-untyped-call]
    os_ = user_agent_parser.ParseOS(ua_string)  # type: ignore[no-untyped-call]
    return ParsedUserAgent(
        device_type=_classify_device_type(ua_string),
        browser_name=browser.get("family") or None,
        browser_version=_version(browser),
        os_name=os_.get("family") or None,
        os_version=_version(os_),
    )
