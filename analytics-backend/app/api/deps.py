"""Part 4 §4.14 — dependency providers. Middleware resolves *who*; these
dependencies turn that into typed objects and, for coarse checks, decide
*may they*. Row-level checks stay in services (Part 4 §4.14)."""

import hashlib
from collections.abc import AsyncIterator

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_database
from app.core.exceptions import AuthenticationError, NotFoundError, PaymentRequiredError
from app.core.redis import get_redis
from app.core.security import decode_access_token
from app.models.core.account import Account
from app.models.core.property import Property
from app.repositories.account_repo import AccountRepository
from app.repositories.realtime_repo import RealtimeRepository
from app.repositories.subscription_repo import GRANTS_ACCESS, SubscriptionRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.services.property_service import PropertyService


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


async def get_owned_property(
    property_id: int,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_read_session),
) -> Property:
    """Part 4 §4.14 — every `/properties/{property_id}/...` analytics route
    depends on this instead of re-checking ownership itself."""
    return await PropertyService(session).get_owned(account_id=account.id, property_id=property_id)


def get_realtime_repo(settings: Settings = Depends(get_app_settings)) -> RealtimeRepository:
    return RealtimeRepository(get_redis(settings))


async def require_active_subscription(
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
) -> None:
    """Part 12 (revised: no free tier) — coarse gate applied at the router
    level (app/api/v1/router.py) to every property-scoped route. Resolves
    "the" workspace the same way `PropertyService` does (org-preferring
    order, app/repositories/workspace_repo.py's `list_for_account`), since
    the subscription and the properties it gates both live on that
    workspace."""
    workspaces = await WorkspaceRepository(session).list_for_account(account.id)
    if not workspaces:
        raise NotFoundError("No workspace found for this account.", code="workspace_not_found")

    subscription = await SubscriptionRepository(session).get_for_workspace(workspaces[0].id)
    if subscription is None or subscription.status not in GRANTS_ACCESS:
        raise PaymentRequiredError(
            "An active subscription is required.", code="subscription_required"
        )


async def require_workspace_subscription(
    workspace_id: int,
    session: AsyncSession = Depends(get_write_session),
) -> None:
    """Path-parameter-aware sibling of `require_active_subscription`, for
    `app/api/v1/workspace.py` routes that already take an explicit
    `workspace_id` — that file's own module docstring explains why every
    route there resolves the workspace from the path rather than implicitly
    ("the account's workspace"), after a live bug from doing exactly that.
    Checking the account's *default* workspace's subscription here would
    reintroduce the same bug for anyone who belongs to more than one
    workspace, so this checks the path's workspace_id directly instead."""
    subscription = await SubscriptionRepository(session).get_for_workspace(workspace_id)
    if subscription is None or subscription.status not in GRANTS_ACCESS:
        raise PaymentRequiredError(
            "An active subscription is required.", code="subscription_required"
        )
