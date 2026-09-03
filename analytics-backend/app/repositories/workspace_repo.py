"""Part 4 §4.6. `core.workspaces` and the memberships that grant access to them."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.types import WorkspaceRole
from app.models.core.account import Account
from app.models.core.membership import Membership
from app.models.core.workspace import Workspace


class WorkspaceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, *, name: str, slug: str, is_organisation: bool) -> Workspace:
        workspace = Workspace(
            name=name, slug=slug, plan="free", is_organisation=is_organisation
        )
        self._session.add(workspace)
        await self._session.flush()
        return workspace

    async def get_by_id(self, workspace_id: int) -> Workspace | None:
        return await self._session.get(Workspace, workspace_id)

    async def list_for_account(self, account_id: int) -> list[Workspace]:
        """Ordered so "the first one" (D-25's one-workspace-per-account MVP
        simplification, still relied on by `PropertyService` and by the
        frontend's `useSelectedWorkspace` default) is a sensible pick rather
        than an arbitrary one. Accepting an invitation (Part 8 §8.8) is the
        one way an account ends up in more than one workspace today, and it
        always happens *after* that account's own workspace was created at
        registration — so a plain `joined_at` order put a teammate's own
        empty personal workspace first, ahead of the organisation they were
        actually invited to manage (found live: an invited admin saw no
        "Invite" button because Settings had silently resolved to their solo
        workspace, where that really is correct). Ordering `is_organisation`
        first fixes the default for every implicit "the account's workspace"
        caller — `PropertyService` included — without needing each one to
        take an explicit `workspace_id`. Genuinely workspace-scoped actions
        (member management, `app/api/v1/workspace.py`) still take one
        explicitly regardless, per the same reasoning found live before."""
        stmt = (
            select(Workspace)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.account_id == account_id, Workspace.deleted_at.is_(None))
            .order_by(Workspace.is_organisation.desc(), Membership.joined_at)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def update_name(self, workspace: Workspace, *, name: str) -> Workspace:
        workspace.name = name
        await self._session.flush()
        return workspace


@dataclass(frozen=True)
class MemberRow:
    account_id: int
    email: str
    full_name: str
    workspace_role: WorkspaceRole
    joined_at: datetime


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

    async def list_with_accounts(self, workspace_id: int) -> list[MemberRow]:
        stmt = (
            select(Membership, Account)
            .join(Account, Account.id == Membership.account_id)
            .where(Membership.workspace_id == workspace_id)
            .order_by(Membership.joined_at)
        )
        result = await self._session.execute(stmt)
        return [
            MemberRow(
                account_id=account.id,
                email=account.email,
                full_name=account.full_name,
                workspace_role=membership.workspace_role,
                joined_at=membership.joined_at,
            )
            for membership, account in result.all()
        ]

    async def update_role(
        self, membership: Membership, *, role: WorkspaceRole
    ) -> Membership:
        membership.workspace_role = role
        await self._session.flush()
        return membership

    async def remove(self, membership: Membership) -> None:
        await self._session.delete(membership)
        await self._session.flush()
