"""Part 8 §8.2-§8.3, §8.6, §8.8 — workspace settings, membership management,
and invitations. Phase 1 scope (see `app/services/workspace_service.py`'s
module docstring for the full list of deliberate simplifications against the
documented design): no `core/permissions.py` capability framework yet (that's
explicitly "still pending" per `property_service.py`), so authorization here
is the same direct workspace-role check that file already uses. No email
delivery either — creating an invitation returns the raw token once, for the
admin to share manually.
"""

from datetime import datetime

from pydantic import EmailStr, Field

from app.core.types import WorkspaceRole
from app.schemas.common import CamelModel


class WorkspaceSummary(CamelModel):
    id: int
    name: str
    slug: str
    plan: str
    my_role: WorkspaceRole


class UpdateWorkspaceRequest(CamelModel):
    name: str = Field(min_length=1, max_length=200)


class MemberSummary(CamelModel):
    account_id: int
    email: str
    full_name: str
    workspace_role: WorkspaceRole
    joined_at: datetime


class UpdateMemberRoleRequest(CamelModel):
    workspace_role: WorkspaceRole


class InviteMemberRequest(CamelModel):
    email: EmailStr
    workspace_role: WorkspaceRole


class InvitationSummary(CamelModel):
    id: int
    email: str
    workspace_role: WorkspaceRole
    created_at: datetime
    expires_at: datetime


class CreatedInvitation(CamelModel):
    invitation: InvitationSummary
    # Phase 1 has no email delivery — this is shown to the inviting admin
    # exactly once, in this response, and never persisted in the clear.
    invite_token: str


class AcceptInvitationRequest(CamelModel):
    token: str
