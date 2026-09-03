"""Part 1 §1.5 "Geo context", Part 5 §5.7 — IP-to-country at ingest.

Memory-mapped MaxMind-format lookup, no network call. The reader is opened
lazily and cached for the process lifetime — `maxminddb.open_database` mmaps
the file, so this costs no meaningful RAM beyond the OS page cache.

If no database path is configured (`ANALYTICS__GEOIP_COUNTRY_DB_PATH` unset,
the Phase 1 default), `lookup_country` returns `None` for everything rather
than raising — geo columns are simply NULL until ops supply a real database.
The IP address itself is never returned or retained by this module's caller
(Part 1 §1.5 "What is deliberately absent").
"""

from functools import lru_cache

import maxminddb

from app.core.config import Settings, get_settings


@lru_cache(maxsize=1)
def _reader(db_path: str) -> maxminddb.Reader:
    return maxminddb.open_database(db_path)


def lookup_country(client_ip: str, settings: Settings | None = None) -> str | None:
    db_path = (settings or get_settings()).analytics.geoip_country_db_path
    if not db_path:
        return None
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
