"""Part 8 §8.2-§8.3, §8.6, §8.8 — workspace settings, membership management,
invitations.

Deliberate Phase 1 deviations from the documented design (mirrors the same
posture `property_service.py` already takes, for the same reason — Part 8
§8.7's `core/permissions.py` capability framework and `AuthContext` are still
pending):

- Authorization is a direct `workspace_role` check against Part 8 §8.6's
  matrix, not `Depends(require_workspace_capability(...))`. Same trust model
  as `PropertyService.get_owned` — correct today, revisit once the capability
  framework exists so every route gets it for free instead of by hand.
- Invitations have no email delivery. `invite_member` returns the raw token
  once; the admin shares it manually. A real send is a Phase 2 addition to
  this one method, not a redesign.
- `accept_invitation` requires the invited person to already have an account
  matching the invitation's email. Part 8 §8.8's combined
  register-via-invitation flow (an invited person with no account yet) is
  explicitly called out as its own pending piece there and is not built here.

Every method below takes an explicit `workspace_id`, unlike
`PropertyService`'s "the account's workspace is whichever one comes back
first" (D-25's one-workspace-per-account MVP simplification). That
simplification does not hold here: accepting an invitation is the one way an
account ends up in more than one workspace, and it is this exact feature's
job to make that happen. Resolving "the" workspace implicitly for a
member-management action was tried first and produced a real, live bug — an
invited admin's own "remove member" call silently resolved to their own solo
workspace instead of the one they were actually trying to manage, because
list order between two memberships is otherwise arbitrary. An explicit id
plus a direct membership lookup (`_require_membership`) has no such
ambiguity, at the cost of the frontend needing to know which workspace it
means (today: `GET /workspaces`, take the first — same simplification,
pushed to a layer where "first" is at least deterministic and harmless).
"""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ConflictError, LastOwnerError, NotFoundError
from app.core.types import WorkspaceRole
from app.models.core.account import Account
from app.models.core.membership import Membership
from app.models.core.workspace import Workspace
from app.repositories.invitation_repo import InvitationRepository
from app.repositories.property_repo import PropertyAccessRepository, PropertyRepository
from app.repositories.workspace_repo import MembershipRepository, WorkspaceRepository
from app.schemas.workspace import (
    CreatedInvitation,
    InvitationSummary,
    MemberSummary,
    WorkspaceSummary,
)
from app.utils.time import utcnow

_ADMIN_ROLES: tuple[WorkspaceRole, ...] = ("owner", "admin")


class WorkspaceService:
    def __init__(self, session: AsyncSession, *, invitation_ttl_days: int) -> None:
        self._session = session
        self._workspaces = WorkspaceRepository(session)
        self._memberships = MembershipRepository(session)
        self._invitations = InvitationRepository(session)
        self._properties = PropertyRepository(session)
        self._property_access = PropertyAccessRepository(session)
        self._invitation_ttl_days = invitation_ttl_days

    async def _require_membership(
        self, workspace_id: int, account_id: int
    ) -> tuple[Workspace, Membership]:
        workspace = await self._workspaces.get_by_id(workspace_id)
        membership = await self._memberships.get(workspace_id, account_id)
        if workspace is None or workspace.deleted_at is not None or membership is None:
            # Composition rule 3 (Part 8 §8.6): a workspace this account
            # cannot see is absent, not forbidden.
            raise NotFoundError("Workspace not found.", code="workspace_not_found")
        return workspace, membership

    def _summary(self, workspace: Workspace, membership: Membership) -> WorkspaceSummary:
        return WorkspaceSummary(
            id=workspace.id,
            name=workspace.name,
            slug=workspace.slug,
            plan=workspace.plan,
            my_role=membership.workspace_role,
        )

    async def list_workspaces(self, account_id: int) -> list[WorkspaceSummary]:
        workspaces = await self._workspaces.list_for_account(account_id)
        summaries = []
        for workspace in workspaces:
            membership = await self._memberships.get(workspace.id, account_id)
            assert membership is not None
            summaries.append(self._summary(workspace, membership))
        return summaries

    async def get_summary(self, workspace_id: int, account_id: int) -> WorkspaceSummary:
        workspace, membership = await self._require_membership(workspace_id, account_id)
        return self._summary(workspace, membership)

    async def update_name(
        self, workspace_id: int, account_id: int, *, name: str
    ) -> WorkspaceSummary:
        async with self._session.begin():
            workspace, membership = await self._require_membership(workspace_id, account_id)
            if membership.workspace_role not in _ADMIN_ROLES:
                raise AuthorizationError(
                    "Only a workspace owner or admin can rename the workspace.",
                    code="forbidden",
                )
            workspace = await self._workspaces.update_name(workspace, name=name)
            return self._summary(workspace, membership)

    async def list_members(self, workspace_id: int, account_id: int) -> list[MemberSummary]:
        await self._require_membership(workspace_id, account_id)
        rows = await self._memberships.list_with_accounts(workspace_id)
        return [
            MemberSummary(
                account_id=row.account_id,
                email=row.email,
                full_name=row.full_name,
                workspace_role=row.workspace_role,
                joined_at=row.joined_at,
            )
            for row in rows
        ]

    async def update_member_role(
        self, workspace_id: int, account_id: int, *, target_account_id: int, role: WorkspaceRole
    ) -> MemberSummary:
        async with self._session.begin():
            _, acting_membership = await self._require_membership(workspace_id, account_id)
            # Part 8 §8.6 matrix: only an owner may change a member's
            # workspace role — an admin promoting a friend to owner would be
            # a privilege escalation admins otherwise cannot perform.
            if acting_membership.workspace_role != "owner":
                raise AuthorizationError(
                    "Only the workspace owner can change a member's role.", code="forbidden"
                )

            target = await self._memberships.get(workspace_id, target_account_id)
            if target is None:
                raise NotFoundError("Member not found.", code="member_not_found")

            if (
                target.workspace_role == "owner"
                and role != "owner"
                and await self._memberships.count_owners(workspace_id) <= 1
            ):
                raise LastOwnerError("A workspace must always have at least one owner.")

            await self._memberships.update_role(target, role=role)
            rows = await self._memberships.list_with_accounts(workspace_id)
            row = next(r for r in rows if r.account_id == target_account_id)
            return MemberSummary(
                account_id=row.account_id,
                email=row.email,
                full_name=row.full_name,
                workspace_role=row.workspace_role,
                joined_at=row.joined_at,
            )

    async def remove_member(
        self, workspace_id: int, account_id: int, *, target_account_id: int
    ) -> None:
        async with self._session.begin():
            _, acting_membership = await self._require_membership(workspace_id, account_id)
            if acting_membership.workspace_role not in _ADMIN_ROLES:
                raise AuthorizationError(
                    "Only a workspace owner or admin can remove a member.", code="forbidden"
                )

            target = await self._memberships.get(workspace_id, target_account_id)
            if target is None:
                raise NotFoundError("Member not found.", code="member_not_found")

            if (
                target.workspace_role == "owner"
                and await self._memberships.count_owners(workspace_id) <= 1
            ):
                raise LastOwnerError("A workspace must always have at least one owner.")

            await self._memberships.remove(target)

    async def invite_member(
        self, workspace_id: int, account_id: int, *, email: str, role: WorkspaceRole
    ) -> CreatedInvitation:
        async with self._session.begin():
            _, acting_membership = await self._require_membership(workspace_id, account_id)
            if acting_membership.workspace_role not in _ADMIN_ROLES:
                raise AuthorizationError(
                    "Only a workspace owner or admin can invite a member.", code="forbidden"
                )
            if role == "owner" and acting_membership.workspace_role != "owner":
                raise AuthorizationError(
                    "Only the workspace owner can invite a new owner.", code="forbidden"
                )

            existing = await self._invitations.get_pending_for_email(
                workspace_id=workspace_id, email=email
            )
            if existing is not None:
                raise ConflictError(
                    "There is already a pending invitation for this email.",
                    code="invitation_pending",
                )

            expires_at = utcnow() + timedelta(days=self._invitation_ttl_days)
            invitation, raw_token = await self._invitations.create(
                workspace_id=workspace_id,
                email=email,
                role=role,
                invited_by=account_id,
                expires_at=expires_at,
            )
            return CreatedInvitation(
                invitation=InvitationSummary(
                    id=invitation.id,
                    email=invitation.email,
                    workspace_role=invitation.workspace_role,
                    created_at=invitation.created_at,
                    expires_at=invitation.expires_at,
                ),
                invite_token=raw_token,
            )

    async def list_invitations(self, workspace_id: int, account_id: int) -> list[InvitationSummary]:
        await self._require_membership(workspace_id, account_id)
        invitations = await self._invitations.list_pending_for_workspace(workspace_id)
        return [
            InvitationSummary(
                id=invitation.id,
                email=invitation.email,
                workspace_role=invitation.workspace_role,
                created_at=invitation.created_at,
                expires_at=invitation.expires_at,
            )
            for invitation in invitations
        ]

    async def revoke_invitation(
        self, workspace_id: int, account_id: int, *, invitation_id: int
    ) -> None:
        async with self._session.begin():
            _, acting_membership = await self._require_membership(workspace_id, account_id)
            if acting_membership.workspace_role not in _ADMIN_ROLES:
                raise AuthorizationError(
                    "Only a workspace owner or admin can revoke an invitation.", code="forbidden"
                )
            invitation = await self._invitations.get_by_id(invitation_id)
            if invitation is None or invitation.workspace_id != workspace_id:
                raise NotFoundError("Invitation not found.", code="invitation_not_found")
            await self._invitations.delete(invitation)

    async def accept_invitation(self, account: Account, *, raw_token: str) -> WorkspaceSummary:
        async with self._session.begin():
            invitation = await self._invitations.get_by_token(raw_token)
            if (
                invitation is None
                or invitation.accepted_at is not None
                or invitation.expires_at < utcnow()
            ):
                raise NotFoundError(
                    "Invitation not found or already used.", code="invitation_not_found"
                )
            # Part 8 §8.8 "Invitation security" — bound to the invited email;
            # accepting while logged in as a different account is refused.
            if invitation.email.casefold() != account.email.casefold():
                raise AuthorizationError(
                    "This invitation was sent to a different email address.",
                    code="invitation_email_mismatch",
                )

            existing_membership = await self._memberships.get(invitation.workspace_id, account.id)
            if existing_membership is None:
                await self._memberships.add(
                    workspace_id=invitation.workspace_id,
                    account_id=account.id,
                    role=invitation.workspace_role,  # type: ignore[arg-type]
                    invited_by=invitation.invited_by,
                )

            for grant in invitation.property_grants:
                property_id = grant.get("property_id")
                role = grant.get("property_role")
                if property_id is None or role is None:
                    continue
                property_ = await self._properties.get_by_id(int(property_id))
                if property_ is None or property_.workspace_id != invitation.workspace_id:
                    continue
                await self._property_access.grant(
                    property_id=property_.id,
                    account_id=account.id,
                    role=role,
                    granted_by=invitation.invited_by,
                )

            await self._invitations.mark_accepted(invitation)

            workspace = await self._workspaces.get_by_id(invitation.workspace_id)
            assert workspace is not None
            membership = await self._memberships.get(invitation.workspace_id, account.id)
            assert membership is not None
            return self._summary(workspace, membership)
