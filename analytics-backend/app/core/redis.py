"""Redis client factory — Part 2 §2.9.

Phase 1 uses Redis for exactly two lightweight, synchronous roles: event-id
dedup and the realtime/session state hash (`app/repositories/realtime_repo.py`).
The heavier roles from the decision register — the Redis Stream durability
log, the response cache, the in-process property-cache invalidation channel —
are Phase 2 (see docs/architecture/05-ingestion-pipeline.md).
"""

from redis.asyncio import Redis

from app.core.config import Settings, get_settings

_redis: Redis | None = None


def get_redis(settings: Settings | None = None) -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(
            (settings or get_settings()).redis.url, decode_responses=True
        )
    return _redis
