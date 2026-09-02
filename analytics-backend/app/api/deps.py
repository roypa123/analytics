"""Part 4 §4.14 — dependency providers. Middleware resolves *who*; these
dependencies turn that into typed objects and, for coarse checks, decide
*may they*. Row-level checks stay in services (Part 4 §4.14)."""

import hashlib
from collections.abc import AsyncIterator

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_database
from app.core.exceptions import AuthenticationError
from app.core.security import decode_access_token
from app.models.core.account import Account
from app.repositories.account_repo import AccountRepository


def get_app_settings() -> Settings:
    return get_settings()


async def get_write_session(
    settings: Settings = Depends(get_app_settings),
) -> AsyncIterator[AsyncSession]:
    db = get_database(settings)
    async with db.write_session() as session:
        yield session


async def get_read_session(
    settings: Settings = Depends(get_app_settings),
) -> AsyncIterator[AsyncSession]:
    db = get_database(settings)
    async with db.read_session() as session:
        yield session


def hash_ip(request: Request) -> bytes | None:
    """Part 1 §1.7 principle applied to auth too: never store a raw IP."""
    client = request.client
    if client is None:
        return None
    return hashlib.blake2b(client.host.encode(), digest_size=16).digest()


async def get_current_account(
    request: Request,
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Account:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise AuthenticationError("Missing or malformed Authorization header.")

    token = auth_header.removeprefix("Bearer ")
    try:
        claims = decode_access_token(token, settings.security)
    except Exception as exc:  # jwt raises several distinct exception types
        raise AuthenticationError("Invalid or expired access token.") from exc

    account = await AccountRepository(session).get_by_id(claims.account_id)
    if account is None:
        raise AuthenticationError("Account not found.")

    # FastAPI caches `get_write_session` per request, so this is the same
    # AsyncSession a route handler's own `session` param receives. The lookup
    # above auto-begins a transaction (SQLAlchemy's default); closing it here
    # means every downstream service can safely open its own with
    # `async with session.begin():` instead of hitting "A transaction is
    # already begun on this Session."
    await session.commit()
    return account
