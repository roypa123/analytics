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

from app.core.types import PropertyRole, WorkspaceRole
from app.schemas.common import CamelModel


class WorkspaceSummary(CamelModel):
    id: int
    name: str
    slug: str
    plan: str
    my_role: WorkspaceRole
    # Part 8 §8.1 (D-19, revised) — the D-25 signup-tab choice. Drives which
    # Settings sections the frontend renders (Members/Invite/Pending
    # invitations); never used for authorization.
    is_organisation: bool


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


class PropertyGrant(CamelModel):
    property_id: int
    property_role: PropertyRole


class InviteMemberRequest(CamelModel):
    email: EmailStr
    workspace_role: WorkspaceRole
    # Rule 1 (Part 8 §8.6) means these are only meaningful for a "member"
    # invite — an owner/admin invitee already sees every property. Ignored,
    # not rejected, when sent alongside an owner/admin role: harmless, and
    # simpler than asking the client to know the rule.
    property_grants: list[PropertyGrant] = Field(default_factory=list)


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
