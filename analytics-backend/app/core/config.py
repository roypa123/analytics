"""Typed application settings.

Part 4 §4.7: config is validated at startup so a malformed or missing value
fails on boot, not inside a request or a background job.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    dsn: str
    sync_dsn: str
    pool_size: int = 5


class RedisSettings(BaseSettings):
    url: str


class SecuritySettings(BaseSettings):
    jwt_private_key: str
    jwt_public_key: str
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    # Part 2 §2.9, D-08 — the master secret the daily visitor-hash salt is
    # derived from via HKDF. Stateless by design: losing Redis (or, in this
    # Phase 1 build, not having a salt cache at all) does not change identity
    # hashes, because the salt is recomputed the same way every time from this
    # secret plus (property_id, local_date). Rotate quarterly in production;
    # rotating it changes every visitor hash from that moment on.
    visitor_hash_secret: str
    # Part 8 §8.8 — how long an invitation link stays acceptable. Phase 1 has
    # no email delivery (app/services/workspace_service.py): the raw token is
    # handed back to the inviting admin to copy/share manually, so this is
    # also the practical window the admin has to actually send it before it
    # goes stale.
    invitation_ttl_days: int = 7


class IngestionSettings(BaseSettings):
    flush_interval_ms: int = 500
    flush_max_rows: int = 1000
    session_timeout_minutes: int = 30


class AnalyticsSettings(BaseSettings):
    raw_event_retention_days: int = 90
    raw_query_range_cap_days: int = 7
    # Part 1 §1.5 "Geo context" / Part 5 §5.7 — path to a MaxMind-format
    # (GeoLite2-Country.mmdb or commercial equivalent) database, memory-mapped
    # at first use. Optional: unset in Phase 1 means every event's geo columns
    # are simply NULL rather than the collector failing. Ops must supply a real
    # database file before country/region breakdowns carry any data.
    geoip_country_db_path: str | None = None


class ObservabilitySettings(BaseSettings):
    log_level: str = "INFO"


class RazorpaySettings(BaseSettings):
    """Part 12 (revised again — Orders, not Subscriptions): this account's
    Test Mode Subscriptions product 401s on every call regardless of key
    validity (confirmed: the same key succeeds against Orders/Payments), so
    billing is built on a one-time Order per billing period instead of a
    Razorpay-managed recurring mandate. `billing_period_days` is how long a
    single captured payment grants access for; there is no `plan_id` because
    Orders carry their own amount/currency per call rather than referencing
    a pre-created Plan resource."""

    key_id: str = ""
    key_secret: str = ""
    webhook_secret: str = ""
    plan_name: str = "Nexlytics"
    plan_amount_paise: int = 99900
    billing_period_days: int = 30


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_nested_delimiter="__",
        extra="ignore",
    )

    environment: Literal["local", "test", "staging", "production"] = "local"

    database: DatabaseSettings
    redis: RedisSettings
    security: SecuritySettings
    ingestion: IngestionSettings = Field(default_factory=IngestionSettings)
    analytics: AnalyticsSettings = Field(default_factory=AnalyticsSettings)
    observability: ObservabilitySettings = Field(default_factory=ObservabilitySettings)
    razorpay: RazorpaySettings = Field(default_factory=RazorpaySettings)

    @model_validator(mode="after")
    def _validate_production_posture(self) -> "Settings":
        if self.environment == "production":
            if "localhost" in self.database.dsn or "127.0.0.1" in self.database.dsn:
                raise ValueError("production DATABASE__DSN must not point at localhost")
            if not self.security.jwt_private_key or not self.security.jwt_public_key:
                raise ValueError("production requires SECURITY__JWT_PRIVATE_KEY/PUBLIC_KEY")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
