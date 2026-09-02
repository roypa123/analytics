"""Part 8 §8.4. Rotation and replay detection live in the service layer;
this repository only stores and looks up hashed tokens."""

import hashlib
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core.refresh_token import RefreshToken
from app.utils.time import utcnow


def hash_token(raw_token: str) -> bytes:
    return hashlib.sha256(raw_token.encode()).digest()


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        account_id: int,
        family_id: uuid.UUID,
        raw_token: str,
        expires_at: datetime,
        user_agent: str | None,
        ip_hash: bytes | None,
    ) -> RefreshToken:
        token = RefreshToken(
            account_id=account_id,
            family_id=family_id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
            user_agent=user_agent,
            ip_hash=ip_hash,
        )
        self._session.add(token)
        await self._session.flush()
        return token

    async def get_by_raw_token(self, raw_token: str) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token))
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def revoke_family(self, family_id: uuid.UUID) -> None:
        stmt = select(RefreshToken).where(
            RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None)
        )
        result = await self._session.execute(stmt)
        for token in result.scalars().all():
            token.revoked_at = utcnow()
