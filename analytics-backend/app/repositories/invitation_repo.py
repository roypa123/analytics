"""Part 8 §8.8, §3.2 — `core.invitations`. `token_hash`, not `token`: an
invitation token is a bearer credential, stored the same way a refresh token
is (Part 8 §8.4) — never in the clear."""

import hashlib
import secrets
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.types import WorkspaceRole
from app.models.core.invitation import Invitation
from app.utils.time import utcnow


def _hash_token(raw_token: str) -> bytes:
    return hashlib.sha256(raw_token.encode()).digest()


class InvitationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        workspace_id: int,
        email: str,
        role: WorkspaceRole,
        invited_by: int,
        expires_at: datetime,
    ) -> tuple[Invitation, str]:
        raw_token = secrets.token_urlsafe(32)
        invitation = Invitation(
            workspace_id=workspace_id,
            email=email,
            workspace_role=role,
            token_hash=_hash_token(raw_token),
            invited_by=invited_by,
            expires_at=expires_at,
        )
        self._session.add(invitation)
        await self._session.flush()
        return invitation, raw_token

    async def get_by_id(self, invitation_id: int) -> Invitation | None:
        return await self._session.get(Invitation, invitation_id)

    async def get_by_token(self, raw_token: str) -> Invitation | None:
        stmt = select(Invitation).where(Invitation.token_hash == _hash_token(raw_token))
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pending_for_email(
        self, *, workspace_id: int, email: str
    ) -> Invitation | None:
        """Part 8 §8.8's "at most one pending invite per email per
        workspace" rule."""
        stmt = select(Invitation).where(
            Invitation.workspace_id == workspace_id,
            Invitation.email == email,
            Invitation.accepted_at.is_(None),
            Invitation.expires_at > utcnow(),
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_pending_for_workspace(self, workspace_id: int) -> list[Invitation]:
        stmt = (
            select(Invitation)
            .where(
                Invitation.workspace_id == workspace_id,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > utcnow(),
            )
            .order_by(Invitation.created_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def mark_accepted(self, invitation: Invitation) -> None:
        invitation.accepted_at = utcnow()
        await self._session.flush()

    async def delete(self, invitation: Invitation) -> None:
        await self._session.delete(invitation)
        await self._session.flush()
