"""Part 1 §1.5 "Geo context", Part 5 §5.7 — IP-to-country at ingest.

Two lookup paths, tried in order:

1. Memory-mapped MaxMind-format lookup, no network call — used whenever
   `ANALYTICS__GEOIP_COUNTRY_DB_PATH` is configured. The reader is opened
   lazily and cached for the process lifetime — `maxminddb.open_database`
   mmaps the file, so this costs no meaningful RAM beyond the OS page cache.
   This is the production path: no per-event network dependency.

2. A free HTTP lookup (ip-api.com, no API key, plain HTTP — HTTPS is a paid
   feature on their free tier) when no database path is configured — the
   Phase 1 default, and what makes local dev show real country data without
   anyone first getting a MaxMind account. This adds a network round-trip to
   the ingest hot path (Part 2 §2.10's "~2 Redis round trips" budget
   explicitly does not include this) and a 45-requests/minute rate limit, so
   it is deliberately NOT the path taken once ops supply a real database
   file — fine for local testing and low-volume early traffic, not a
   production geo strategy. A short timeout plus the usual "never raises"
   contract keeps a slow/unreachable API from blocking ingestion — geo
   columns are simply NULL that request, same as before this existed.

Either way, `lookup_country` returns `None` rather than raising when a
country can't be determined (unset database, unreachable API, a
private/loopback IP no geolocation service can resolve — 127.0.0.1 during
local testing always falls in this bucket, database or API). The IP address
itself is never returned or retained by this module's caller (Part 1 §1.5
"What is deliberately absent").
"""

from functools import lru_cache

import httpx
import maxminddb

from app.core.config import Settings, get_settings

_HTTP_TIMEOUT_SECONDS = 2.0
_http_client: httpx.AsyncClient | None = None


@lru_cache(maxsize=1)
def _reader(db_path: str) -> maxminddb.Reader:
    return maxminddb.open_database(db_path)


def _lookup_local(client_ip: str, db_path: str) -> str | None:
    try:
        reader = _reader(db_path)
        record = reader.get(client_ip)
    except (OSError, ValueError):
        return None
    if not isinstance(record, dict):
        return None
    country = record.get("country") or record.get("registered_country")
    if not isinstance(country, dict):
        return None
    iso_code = country.get("iso_code")
    return iso_code if isinstance(iso_code, str) else None


def _http_client_instance() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS)
    return _http_client


async def _lookup_via_api(client_ip: str) -> str | None:
    try:
        # Plain HTTP, deliberately: ip-api.com's free tier does not offer
        # HTTPS at all (it 400s/refuses), so there is no TLS downgrade here.
        response = await _http_client_instance().get(
            f"http://ip-api.com/json/{client_ip}", params={"fields": "status,countryCode"}
        )
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("status") != "success":
        return None
    country_code = data.get("countryCode")
    return country_code if isinstance(country_code, str) else None


async def lookup_country(client_ip: str, settings: Settings | None = None) -> str | None:
    db_path = (settings or get_settings()).analytics.geoip_country_db_path
    if db_path:
        return _lookup_local(client_ip, db_path)
    return await _lookup_via_api(client_ip)
