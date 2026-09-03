"""Part 4 §4.1, D-11 — the router IS the controller. Part 8 §8.6's
capability matrix is enforced in `WorkspaceService` (see its module
docstring for why this is a direct role check rather than
`Depends(require_workspace_capability(...))`, and for why every route here
takes an explicit `workspace_id` instead of resolving "the account's
workspace" implicitly).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_current_account, get_write_session
from app.core.config import Settings
from app.models.core.account import Account
from app.schemas.common import Envelope
from app.schemas.workspace import (
    AcceptInvitationRequest,
    CreatedInvitation,
    InvitationSummary,
    InviteMemberRequest,
    MemberSummary,
    UpdateMemberRoleRequest,
    UpdateWorkspaceRequest,
    WorkspaceSummary,
)
from app.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces", tags=["workspace"])


def _service(session: AsyncSession, settings: Settings) -> WorkspaceService:
    return WorkspaceService(session, invitation_ttl_days=settings.security.invitation_ttl_days)


@router.get("", response_model=Envelope[list[WorkspaceSummary]])
async def list_workspaces(
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[list[WorkspaceSummary]]:
    workspaces = await _service(session, settings).list_workspaces(account.id)
    return Envelope(data=workspaces)


@router.post("/accept-invitation", response_model=Envelope[WorkspaceSummary])
async def accept_invitation(
    body: AcceptInvitationRequest,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[WorkspaceSummary]:
    summary = await _service(session, settings).accept_invitation(account, raw_token=body.token)
    return Envelope(data=summary)


@router.get("/{workspace_id}", response_model=Envelope[WorkspaceSummary])
async def get_workspace(
    workspace_id: int,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[WorkspaceSummary]:
    summary = await _service(session, settings).get_summary(workspace_id, account.id)
    return Envelope(data=summary)


@router.patch("/{workspace_id}", response_model=Envelope[WorkspaceSummary])
async def update_workspace(
    workspace_id: int,
    body: UpdateWorkspaceRequest,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[WorkspaceSummary]:
    summary = await _service(session, settings).update_name(
        workspace_id, account.id, name=body.name
    )
    return Envelope(data=summary)


@router.get("/{workspace_id}/members", response_model=Envelope[list[MemberSummary]])
async def list_members(
    workspace_id: int,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[list[MemberSummary]]:
    members = await _service(session, settings).list_members(workspace_id, account.id)
    return Envelope(data=members)


@router.patch("/{workspace_id}/members/{target_account_id}", response_model=Envelope[MemberSummary])
async def update_member_role(
    workspace_id: int,
    target_account_id: int,
    body: UpdateMemberRoleRequest,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[MemberSummary]:
    member = await _service(session, settings).update_member_role(
        workspace_id, account.id, target_account_id=target_account_id, role=body.workspace_role
    )
    return Envelope(data=member)


@router.delete("/{workspace_id}/members/{target_account_id}", status_code=204)
async def remove_member(
    workspace_id: int,
    target_account_id: int,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> None:
    await _service(session, settings).remove_member(
        workspace_id, account.id, target_account_id=target_account_id
    )


@router.get("/{workspace_id}/invitations", response_model=Envelope[list[InvitationSummary]])
async def list_invitations(
    workspace_id: int,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[list[InvitationSummary]]:
    invitations = await _service(session, settings).list_invitations(workspace_id, account.id)
    return Envelope(data=invitations)


@router.post(
    "/{workspace_id}/invitations", response_model=Envelope[CreatedInvitation], status_code=201
)
async def invite_member(
    workspace_id: int,
    body: InviteMemberRequest,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> Envelope[CreatedInvitation]:
    created = await _service(session, settings).invite_member(
        workspace_id, account.id, email=body.email, role=body.workspace_role
    )
    return Envelope(data=created)


@router.delete("/{workspace_id}/invitations/{invitation_id}", status_code=204)
async def revoke_invitation(
    workspace_id: int,
    invitation_id: int,
    account: Account = Depends(get_current_account),
    session: AsyncSession = Depends(get_write_session),
    settings: Settings = Depends(get_app_settings),
) -> None:
    await _service(session, settings).revoke_invitation(
        workspace_id, account.id, invitation_id=invitation_id
    )
