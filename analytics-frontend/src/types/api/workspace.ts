// Mirrors app/schemas/workspace.py (Part 8 §8.2-§8.3, §8.6, §8.8).

export type WorkspaceRole = "owner" | "admin" | "member"

export interface WorkspaceSummary {
  id: number
  name: string
  slug: string
  plan: string
  myRole: WorkspaceRole
}

export interface UpdateWorkspaceRequest {
  name: string
}

export interface MemberSummary {
  accountId: number
  email: string
  fullName: string
  workspaceRole: WorkspaceRole
  joinedAt: string
}

export interface UpdateMemberRoleRequest {
  workspaceRole: WorkspaceRole
}

export interface InviteMemberRequest {
  email: string
  workspaceRole: WorkspaceRole
}

export interface InvitationSummary {
  id: number
  email: string
  workspaceRole: WorkspaceRole
  createdAt: string
  expiresAt: string
}

export interface CreatedInvitation {
  invitation: InvitationSummary
  inviteToken: string
}

export interface AcceptInvitationRequest {
  token: string
}
