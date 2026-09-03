"""Part 8 §8.4, §8.8. Owns the transaction boundary for every multi-table
auth operation (D-16) — repositories never commit.

Registration auto-creates a workspace with the new account as `owner`
(Part 8 §8.8, D-19): the user experiences a single-player product, and the
same tenancy model scales to a team the moment a second member is invited.
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import SecuritySettings
from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import hash_password, issue_access_token, verify_password
from app.models.core.account import Account
from app.repositories.account_repo import AccountRepository
from app.repositories.refresh_token_repo import RefreshTokenRepository
from app.repositories.workspace_repo import MembershipRepository, WorkspaceRepository
from app.utils.slug import slugify
from app.utils.time import utcnow


@dataclass(frozen=True)
class AuthResult:
    account: Account
    access_token: str
    refresh_token: str
    refresh_expires_at: datetime


class AuthService:
    def __init__(self, session: AsyncSession, settings: SecuritySettings) -> None:
        self._session = session
        self._settings = settings
        self._accounts = AccountRepository(session)
        self._workspaces = WorkspaceRepository(session)
        self._memberships = MembershipRepository(session)
        self._refresh_tokens = RefreshTokenRepository(session)

    async def register(
        self,
        *,
        email: str,
        password: str,
        full_name: str,
        organisation_name: str | None,
        user_agent: str | None,
        ip_hash: bytes | None,
    ) -> AuthResult:
        async with self._session.begin():
            existing = await self._accounts.get_by_email(email)
            if existing is not None:
                raise ConflictError(
                    "An account with this email already exists.", code="email_taken"
                )

            account = await self._accounts.create(
                email=email, password_hash=hash_password(password), full_name=full_name
            )

            # Part 8 §8.8 — auto-create the workspace, make the new account
            # its owner. No "personal account" special case (D-19). The
            # "Organisation" signup tab supplies organisation_name directly;
            # the "Individual" tab omits it, so the workspace is named from
            # full_name instead. An invited teammate registering to accept an
            # invitation never sees either tab and never gets a workspace
            # created here (§8.8 "Adding a teammate" — still pending
            # implementation, tracked separately from this endpoint).
            workspace_name = organisation_name or f"{full_name}'s Workspace"
            workspace = await self._workspaces.create(
                name=workspace_name, slug=slugify(workspace_name)
            )
            await self._memberships.add(
                workspace_id=workspace.id, account_id=account.id, role="owner"
            )

            return await self._issue_session(account, user_agent=user_agent, ip_hash=ip_hash)

    async def login(
        self,
        *,
        email: str,
        password: str,
        organisation_name: str | None,
        user_agent: str | None,
        ip_hash: bytes | None,
    ) -> AuthResult:
        async with self._session.begin():
            account = await self._accounts.get_by_email(email)
            if account is None or account.password_hash is None:
                # Timing-safe failure (Part 8 §8.4): hash a dummy value on the
                # not-found path so this branch costs the same as a real check.
                verify_password(password, hash_password("dummy-not-a-real-password"))
                raise AuthenticationError("Invalid email or password.", code="invalid_credentials")

            if not verify_password(password, account.password_hash):
                raise AuthenticationError("Invalid email or password.", code="invalid_credentials")

            # Only asserted from the login page's "Organisation" tab (D-25).
            # Checked after the password, since the account is already
            # authenticated at this point — this is a workspace-membership
            # check, not a second credentials check, so it gets its own
            # specific error rather than the generic invalid_credentials one.
            if organisation_name is not None:
                workspaces = await self._workspaces.list_for_account(account.id)
                if not any(
                    w.name.casefold() == organisation_name.casefold() for w in workspaces
                ):
                    raise AuthenticationError(
                        "This account has no matching organisation.",
                        code="organisation_mismatch",
                    )

            return await self._issue_session(account, user_agent=user_agent, ip_hash=ip_hash)

    async def refresh(
        self, *, raw_refresh_token: str, user_agent: str | None, ip_hash: bytes | None
    ) -> AuthResult:
        """Token rotation with replay detection (D-20, Part 8 §8.4): a token
        presented a second time revokes its entire family and forces
        re-authentication, rather than silently failing."""
        async with self._session.begin():
            token = await self._refresh_tokens.get_by_raw_token(raw_refresh_token)
            if token is None or token.expires_at < utcnow():
                raise AuthenticationError("Session expired.", code="session_expired")

            if token.revoked_at is not None or token.used_at is not None:
                await self._refresh_tokens.revoke_family(token.family_id)
                raise AuthenticationError(
                    "Session invalid — possible token replay.", code="token_replay_detected"
                )

            token.used_at = utcnow()

            account = await self._accounts.get_by_id(token.account_id)
            if account is None:
                raise AuthenticationError("Account not found.", code="invalid_credentials")

            return await self._issue_session(
                account, user_agent=user_agent, ip_hash=ip_hash, family_id=token.family_id
            )

    async def update_profile(self, account: Account, *, full_name: str) -> Account:
        async with self._session.begin():
            account.full_name = full_name
            await self._session.flush()
            return account

    async def change_password(
        self, account: Account, *, current_password: str, new_password: str
    ) -> None:
        async with self._session.begin():
            if account.password_hash is None or not verify_password(
                current_password, account.password_hash
            ):
                raise AuthenticationError(
                    "Current password is incorrect.", code="incorrect_password"
                )
            account.password_hash = hash_password(new_password)
            await self._refresh_tokens.revoke_all_for_account(account.id)

    async def _issue_session(
        self,
        account: Account,
        *,
        user_agent: str | None,
        ip_hash: bytes | None,
        family_id: uuid.UUID | None = None,
    ) -> AuthResult:
        session_id = str(uuid.uuid4())
        access_token = issue_access_token(account.id, session_id, self._settings)

        raw_refresh_token = secrets.token_urlsafe(32)
        # Aware for the AuthResult/cookie (Starlette's set_cookie requires a
        # UTC-aware datetime for `expires`); naive for the DB write, since
        # every core.* timestamp column is TIMESTAMP WITHOUT TIME ZONE and
        # asyncpg refuses to bind an aware value to one.
        expires_at = datetime.now(UTC) + timedelta(days=self._settings.refresh_token_ttl_days)
        await self._refresh_tokens.create(
            account_id=account.id,
            family_id=family_id or uuid.uuid4(),
            raw_token=raw_refresh_token,
            expires_at=expires_at.replace(tzinfo=None),
            user_agent=user_agent,
            ip_hash=ip_hash,
        )

        return AuthResult(
            account=account,
            access_token=access_token,
            refresh_token=raw_refresh_token,
            refresh_expires_at=expires_at,
        )
