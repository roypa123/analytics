"""Part 4 §4.6. `core.workspaces` and the memberships that grant access to them."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.types import WorkspaceRole
from app.models.core.membership import Membership
from app.models.core.workspace import Workspace


class WorkspaceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, *, name: str, slug: str) -> Workspace:
        workspace = Workspace(name=name, slug=slug, plan="free")
        self._session.add(workspace)
        await self._session.flush()
        return workspace

    async def get_by_id(self, workspace_id: int) -> Workspace | None:
        return await self._session.get(Workspace, workspace_id)

    async def list_for_account(self, account_id: int) -> list[Workspace]:
        stmt = (
            select(Workspace)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.account_id == account_id, Workspace.deleted_at.is_(None))
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())


class MembershipRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        *,
        workspace_id: int,
        account_id: int,
        role: WorkspaceRole,
        invited_by: int | None = None,
    ) -> Membership:
        membership = Membership(
            workspace_id=workspace_id,
            account_id=account_id,
            workspace_role=role,
            invited_by=invited_by,
        )
        self._session.add(membership)
        await self._session.flush()
        return membership

    async def get(self, workspace_id: int, account_id: int) -> Membership | None:
        return await self._session.get(Membership, (workspace_id, account_id))

    async def count_for_workspace(self, workspace_id: int) -> int:
        stmt = select(Membership).where(Membership.workspace_id == workspace_id)
        result = await self._session.execute(stmt)
        return len(result.scalars().all())

    async def count_owners(self, workspace_id: int) -> int:
        stmt = select(Membership).where(
            Membership.workspace_id == workspace_id, Membership.workspace_role == "owner"
        )
        result = await self._session.execute(stmt)
        return len(result.scalars().all())
