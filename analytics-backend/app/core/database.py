"""Engine and session factories — Part 4 §4.6, §4.12.

Two engines per role: a write (primary) engine and a read (replica) engine.
For local/dev they may point at the same DSN; in staging/production the
replica DSN differs. Repositories choose which session to use; this module
only constructs them.

Transactions are demarcated by services (`async with session.begin():`),
never here and never inside a repository (Part 4 §4.12, D-16).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings


class Database:
    def __init__(self, settings: Settings) -> None:
        # asyncpg + PgBouncer transaction-mode pooling requires disabling the
        # driver's own prepared-statement cache (Part 3 §3.12, Action A-08) —
        # otherwise concurrent requests intermittently fail with
        # "prepared statement already exists" once a pooler is introduced.
        connect_args = {
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        }

        self.write_engine: AsyncEngine = create_async_engine(
            settings.database.dsn,
            pool_size=settings.database.pool_size,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        # A distinct read engine — same DSN today, a replica DSN in
        # staging/production (Part 2 §2.6). Kept as a separate engine from day
        # one so the read/write split is structural, not a later refactor.
        self.read_engine: AsyncEngine = self.write_engine

        self._write_session_factory = async_sessionmaker(
            self.write_engine, expire_on_commit=False, class_=AsyncSession
        )
        self._read_session_factory = async_sessionmaker(
            self.read_engine, expire_on_commit=False, class_=AsyncSession
        )

    @asynccontextmanager
    async def write_session(self) -> AsyncIterator[AsyncSession]:
        async with self._write_session_factory() as session:
            yield session

    @asynccontextmanager
    async def read_session(self) -> AsyncIterator[AsyncSession]:
        async with self._read_session_factory() as session:
            yield session

    async def dispose(self) -> None:
        await self.write_engine.dispose()


_database: Database | None = None


def get_database(settings: Settings | None = None) -> Database:
    global _database
    if _database is None:
        _database = Database(settings or get_settings())
    return _database
