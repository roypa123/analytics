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


class IngestionSettings(BaseSettings):
    flush_interval_ms: int = 500
    flush_max_rows: int = 1000
    session_timeout_minutes: int = 30


class AnalyticsSettings(BaseSettings):
    raw_event_retention_days: int = 90
    raw_query_range_cap_days: int = 7


class ObservabilitySettings(BaseSettings):
    log_level: str = "INFO"


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
