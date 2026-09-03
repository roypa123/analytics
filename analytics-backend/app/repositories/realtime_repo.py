"""Part 2 §2.7 "Realtime path", Part 1 §1.9 dedup, Part 1 §1.6 sessionization
cache — the three Redis-backed roles Phase 1 actually implements (see the
module docstring in `app/core/redis.py` for what's deferred).

One Redis hash per (property, visitor) does double duty: it is both the
session "last-seen" cache Part 1 §1.6 describes and the realtime index's
source of "what page is this visitor on right now" — one write per incoming
event covers both concerns, matching the "~2 Redis round trips" budget in
Part 2 §2.10 (this hash write, plus the dedup `SET`).

A companion sorted set per property indexes which visitor hashes are
currently active, scored by last-seen unix time, so reading "who's active
right now" is a bounded `ZRANGE` rather than an `O(keyspace)` `SCAN`. Fanning
out to read each active visitor's current page/country (Python-side
`Counter`) replaces the documented `ZINCRBY` leaderboards — simpler, and
correct-by-construction against the awkward case a naive incremental counter
gets wrong: a visitor navigating from page A to page B must decrement A's
count, not just increment B's. The active-visitor set is small by
definition (bounded by concurrent visitors, not total traffic), so the
fan-out read is cheap.
"""

from collections import Counter
from dataclasses import dataclass

from redis.asyncio import Redis


def _dedup_key(event_id: str) -> str:
    return f"dedup:{event_id}"


def _visitor_key(property_id: int, visitor_hash_hex: str) -> str:
    return f"rt:{property_id}:visitor:{visitor_hash_hex}"


def _active_index_key(property_id: int) -> str:
    return f"rt:{property_id}:active"


@dataclass(frozen=True)
class SessionState:
    session_id: str
    started_at: str  # ISO timestamp, stored as a string field on the hash
    last_seen_epoch: float
    local_date: str
    utm_source: str
    utm_medium: str
    page_path: str
    country_code: str


@dataclass(frozen=True)
class RealtimeSnapshotData:
    active_visitor_count: int
    pages: Counter[str]
    countries: Counter[str]


class RealtimeRepository:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def claim_event_id(self, event_id: str, *, ttl_seconds: int = 86_400) -> bool:
        """`True` if this is the first time we've seen `event_id` in the TTL
        window (Part 1 §1.9). The DB primary key is the backstop for a Redis
        miss/flush, per D-06's "belt and braces" reasoning."""
        claimed = await self._redis.set(_dedup_key(event_id), "1", nx=True, ex=ttl_seconds)
        return bool(claimed)

    async def get_session_state(
        self, *, property_id: int, visitor_hash_hex: str
    ) -> SessionState | None:
        raw = await self._redis.hgetall(_visitor_key(property_id, visitor_hash_hex))
        if not raw:
            return None
        return SessionState(
            session_id=raw["session_id"],
            started_at=raw["started_at"],
            last_seen_epoch=float(raw["last_seen_epoch"]),
            local_date=raw["local_date"],
            utm_source=raw.get("utm_source", ""),
            utm_medium=raw.get("utm_medium", ""),
            page_path=raw.get("page_path", ""),
            country_code=raw.get("country_code", ""),
        )

    async def set_session_state(
        self,
        *,
        property_id: int,
        visitor_hash_hex: str,
        state: SessionState,
        ttl_seconds: int,
    ) -> None:
        key = _visitor_key(property_id, visitor_hash_hex)
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hset(
                key,
                mapping={
                    "session_id": state.session_id,
                    "started_at": state.started_at,
                    "last_seen_epoch": state.last_seen_epoch,
                    "local_date": state.local_date,
                    "utm_source": state.utm_source,
                    "utm_medium": state.utm_medium,
                    "page_path": state.page_path,
                    "country_code": state.country_code,
                },
            )
            pipe.expire(key, ttl_seconds)
            pipe.zadd(_active_index_key(property_id), {visitor_hash_hex: state.last_seen_epoch})
            await pipe.execute()

    async def get_active_snapshot(
        self, *, property_id: int, now_epoch: float, window_seconds: int
    ) -> RealtimeSnapshotData:
        index_key = _active_index_key(property_id)
        cutoff = now_epoch - window_seconds
        await self._redis.zremrangebyscore(index_key, "-inf", cutoff)
        visitor_hashes = await self._redis.zrange(index_key, 0, -1)

        if not visitor_hashes:
            return RealtimeSnapshotData(0, Counter(), Counter())

        async with self._redis.pipeline(transaction=False) as pipe:
            for visitor_hash_hex in visitor_hashes:
                pipe.hmget(
                    _visitor_key(property_id, visitor_hash_hex), "page_path", "country_code"
                )
            results = await pipe.execute()

        pages: Counter[str] = Counter()
        countries: Counter[str] = Counter()
        for page_path, country_code in results:
            if page_path:
                pages[page_path] += 1
            if country_code:
                countries[country_code] += 1

        return RealtimeSnapshotData(len(visitor_hashes), pages, countries)
