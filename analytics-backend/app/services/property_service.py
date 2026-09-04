"""Part 4 §4.1, §4.12. Owns the transaction boundary for property creation.

No `core/permissions.py`/`AuthContext` enforcement layer yet (Part 8 §8.7,
still pending) — this applies composition rules 1-3 (Part 8 §8.6) directly
rather than through that framework: a workspace owner/admin sees every
property with no explicit grant needed (rule 1); anyone else sees only the
properties they hold a `property_access` row for (rule 2), and a property
outside that set is absent, not forbidden (rule 3, `NotFoundError` either
way). The creator of a property is always granted `admin` on it explicitly
(even an owner/admin, for whom this is redundant under rule 1) so a plain
member — who cannot create a property through this service today only
because nothing enforces the "owner/admin only" half of the capability
matrix yet — can't create a property and immediately lose the ability to see
it once list filtering is real.

MVP simplification, not yet a documented decision worth its own D-nn: every
account has exactly one workspace today (created at registration, D-25) and
there is no workspace-switcher UI, so "the account's workspace" is simply the
first one returned. Revisit once an account can belong to more than one
(Part 8 §8.8 "Adding a teammate," still pending).
"""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.types import PropertyRole, WorkspaceRole
from app.models.core.property import Property
from app.repositories.property_repo import PropertyAccessRepository, PropertyRepository
from app.repositories.workspace_repo import MembershipRepository, WorkspaceRepository

_UNRESTRICTED_ROLES: tuple[WorkspaceRole, ...] = ("owner", "admin")


@dataclass(frozen=True)
class PropertyWithRole:
    property: Property
    my_role: PropertyRole


class PropertyService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._properties = PropertyRepository(session)
        self._property_access = PropertyAccessRepository(session)
        self._workspaces = WorkspaceRepository(session)
        self._memberships = MembershipRepository(session)

    async def _resolve_workspace_id(self, account_id: int) -> int:
        workspaces = await self._workspaces.list_for_account(account_id)
        if not workspaces:
            raise NotFoundError(
                "No workspace found for this account.", code="workspace_not_found"
            )
        return workspaces[0].id

    async def _resolve_membership(self, account_id: int) -> tuple[int, WorkspaceRole]:
        workspace_id = await self._resolve_workspace_id(account_id)
        membership = await self._memberships.get(workspace_id, account_id)
        assert membership is not None  # workspace_id came from this account's own membership
        return workspace_id, membership.workspace_role  # type: ignore[return-value]

    async def create_for_account(
        self, *, account_id: int, name: str, domain: str
    ) -> PropertyWithRole:
        async with self._session.begin():
            workspace_id = await self._resolve_workspace_id(account_id)
            prop = await self._properties.create_default(
                workspace_id=workspace_id, name=name, domain=domain
            )
            await self._property_access.grant(
                property_id=prop.id, account_id=account_id, role="admin", granted_by=account_id
            )
            return PropertyWithRole(property=prop, my_role="admin")

    async def list_for_account(self, account_id: int) -> list[PropertyWithRole]:
        workspace_id, role = await self._resolve_membership(account_id)
        properties = await self._properties.list_for_workspace(workspace_id)
        if role in _UNRESTRICTED_ROLES:
            return [PropertyWithRole(property=p, my_role="admin") for p in properties]
        accessible_ids = await self._property_access.accessible_property_ids(account_id)
        return [
            PropertyWithRole(property=p, my_role=accessible_ids[p.id])
            for p in properties
            if p.id in accessible_ids
        ]

    async def get_owned(self, *, account_id: int, property_id: int) -> Property:
        """Analytics endpoints' authorization check (Part 4 §4.14)."""
        workspace_id, role = await self._resolve_membership(account_id)
        prop = await self._properties.get_by_id(property_id)
        if prop is None or prop.workspace_id != workspace_id:
            raise NotFoundError("Property not found.", code="property_not_found")
        if role not in _UNRESTRICTED_ROLES:
            accessible_ids = await self._property_access.accessible_property_ids(account_id)
            if property_id not in accessible_ids:
                # Rule 3: a property this account can't see is absent, not
                # forbidden — same NotFoundError as "doesn't exist."
                raise NotFoundError("Property not found.", code="property_not_found")
        return prop

    async def delete_property(self, *, account_id: int, property_id: int) -> None:
        """Soft-delete only (`PropertyRepository.soft_delete`) — the
        tracking id and any events already collected under it are kept, the
        property just stops appearing in `list_for_account` and the
        collector rejects further events against its `tracking_id`."""
        async with self._session.begin():
            workspace_id = await self._resolve_workspace_id(account_id)
            prop = await self._properties.get_by_id(property_id)
            if prop is None or prop.workspace_id != workspace_id:
                raise NotFoundError("Property not found.", code="property_not_found")
            await self._properties.soft_delete(prop)
