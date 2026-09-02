"""Part 4 §4.1, §4.12. Owns the transaction boundary for property creation.

No fine-grained per-property authorization yet — Part 8 §8.7's enforcement
layer (`core/permissions.py`, `AuthContext`) is still pending, tracked
alongside the rest of that section. This trusts that the account is a member
of the workspace it resolves, and relies on composition rule 1 (Part 8 §8.6):
a workspace owner/admin needs no explicit `property_access` row to see a
property they created, so none is written here.

MVP simplification, not yet a documented decision worth its own D-nn: every
account has exactly one workspace today (created at registration, D-25) and
there is no workspace-switcher UI, so "the account's workspace" is simply the
first one returned. Revisit once an account can belong to more than one
(Part 8 §8.8 "Adding a teammate," still pending).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.core.property import Property
from app.repositories.property_repo import PropertyRepository
from app.repositories.workspace_repo import WorkspaceRepository


class PropertyService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._properties = PropertyRepository(session)
        self._workspaces = WorkspaceRepository(session)

    async def _resolve_workspace_id(self, account_id: int) -> int:
        workspaces = await self._workspaces.list_for_account(account_id)
        if not workspaces:
            raise NotFoundError(
                "No workspace found for this account.", code="workspace_not_found"
            )
        return workspaces[0].id

    async def create_for_account(self, *, account_id: int, name: str, domain: str) -> Property:
        async with self._session.begin():
            workspace_id = await self._resolve_workspace_id(account_id)
            return await self._properties.create_default(
                workspace_id=workspace_id, name=name, domain=domain
            )

    async def list_for_account(self, account_id: int) -> list[Property]:
        workspace_id = await self._resolve_workspace_id(account_id)
        return await self._properties.list_for_workspace(workspace_id)
