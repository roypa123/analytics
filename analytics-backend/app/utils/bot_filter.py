"""Part 2 §2.4 step 3, Part 5 §5.5 — bot filtering at the edge.

Phase 1 ships a UA-substring denylist covering the traffic that actually
shows up in typical raw logs (search/SEO crawlers, uptime monitors, social
link-preview fetchers, generic HTTP clients, and headless browsers used for
scraping/testing). It is deliberately conservative — a false negative just
means the same bot traffic every unfiltered analytics tool would count in;
a false positive silently drops a real visitor, which is worse. The fuller,
maintained bot list plus known-bot IP ranges (Part 5 §5.5) is Phase 2.
"""

import re

_BOT_PATTERN = re.compile(
    r"bot|crawl|spider|slurp|facebookexternalhit|preview|"
    r"headless|phantomjs|selenium|puppeteer|playwright|"
    r"curl/|wget/|python-requests|python-urllib|go-http-client|"
    r"pingdom|uptimerobot|monitor",
    re.IGNORECASE,
)


def is_bot(user_agent: str | None) -> bool:
    if not user_agent:
        return True
    return bool(_BOT_PATTERN.search(user_agent))
