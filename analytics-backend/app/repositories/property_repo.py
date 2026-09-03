"""Part 4 §4.6. `core.properties` and `core.property_access`."""

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.types import PropertyRole
from app.models.core.property import Property
from app.models.core.property_access import PropertyAccess


def _generate_tracking_id() -> str:
    return f"ap_{secrets.token_urlsafe(12)}"


class PropertyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_default(self, *, workspace_id: int, domain: str, name: str) -> Property:
        prop = Property(
            workspace_id=workspace_id,
            name=name,
            tracking_id=_generate_tracking_id(),
            domain=domain,
        )
        self._session.add(prop)
        await self._session.flush()
        return prop

    async def get_by_id(self, property_id: int) -> Property | None:
        prop = await self._session.get(Property, property_id)
        if prop is not None and prop.deleted_at is not None:
            return None
        return prop

    async def get_by_tracking_id(self, tracking_id: str) -> Property | None:
        """The collector's hot-path lookup (Part 2 §2.4 step 2). Phase 1 does
        this as a per-event query; the documented in-process LRU cache with a
        Redis pub/sub invalidation channel is Phase 2 (this is not yet a
        volume the extra cache layer pays for)."""
        stmt = select(Property).where(
            Property.tracking_id == tracking_id, Property.deleted_at.is_(None)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_workspace(self, workspace_id: int) -> list[Property]:
        stmt = select(Property).where(
            Property.workspace_id == workspace_id, Property.deleted_at.is_(None)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())


class PropertyAccessRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def grant(
        self,
        *,
        property_id: int,
        account_id: int,
        role: PropertyRole,
        granted_by: int | None = None,
    ) -> PropertyAccess:
        access = PropertyAccess(
            property_id=property_id,
            account_id=account_id,
            property_role=role,
            granted_by=granted_by,
        )
        self._session.add(access)
        await self._session.flush()
        return access

    async def accessible_property_ids(self, account_id: int) -> dict[int, PropertyRole]:
        """Part 8 §8.7 — the map an AuthContext is built from. Does NOT apply
        the workspace-admin elevation (composition rule 1); the service layer
        merges that in, since it requires workspace role which this
        repository does not know about."""
        stmt = select(PropertyAccess).where(PropertyAccess.account_id == account_id)
        result = await self._session.execute(stmt)
        return {row.property_id: row.property_role for row in result.scalars().all()}  # type: ignore[misc]
