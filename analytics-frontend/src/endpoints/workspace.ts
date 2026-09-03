import { client } from "@/api/client"
import { paths } from "@/endpoints/paths"
import type {
  AcceptInvitationRequest,
  CreatedInvitation,
  InvitationSummary,
  InviteMemberRequest,
  MemberSummary,
  UpdateMemberRoleRequest,
  UpdateWorkspaceRequest,
  WorkspaceSummary,
} from "@/types/api/workspace"

// Part 7 §7.6 — plain async functions, no React, no caching.

interface Envelope<T> {
  data: T
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await client.get<Envelope<WorkspaceSummary[]>>(paths.workspaces.root)
  return res.data.data
}

export async function updateWorkspace(
  workspaceId: number,
  body: UpdateWorkspaceRequest
): Promise<WorkspaceSummary> {
  const res = await client.patch<Envelope<WorkspaceSummary>>(
    paths.workspaces.detail(workspaceId),
    body
  )
  return res.data.data
}

export async function listMembers(workspaceId: number): Promise<MemberSummary[]> {
  const res = await client.get<Envelope<MemberSummary[]>>(paths.workspaces.members(workspaceId))
  return res.data.data
}

export async function updateMemberRole(
  workspaceId: number,
  accountId: number,
  body: UpdateMemberRoleRequest
): Promise<MemberSummary> {
  const res = await client.patch<Envelope<MemberSummary>>(
    paths.workspaces.member(workspaceId, accountId),
    body
  )
  return res.data.data
}

export async function removeMember(workspaceId: number, accountId: number): Promise<void> {
  await client.delete(paths.workspaces.member(workspaceId, accountId))
}

export async function listInvitations(workspaceId: number): Promise<InvitationSummary[]> {
  const res = await client.get<Envelope<InvitationSummary[]>>(
    paths.workspaces.invitations(workspaceId)
  )
  return res.data.data
}

export async function inviteMember(
  workspaceId: number,
  body: InviteMemberRequest
): Promise<CreatedInvitation> {
  const res = await client.post<Envelope<CreatedInvitation>>(
    paths.workspaces.invitations(workspaceId),
    body
  )
  return res.data.data
}

export async function revokeInvitation(workspaceId: number, invitationId: number): Promise<void> {
  await client.delete(paths.workspaces.invitation(workspaceId, invitationId))
}

export async function acceptInvitation(
  body: AcceptInvitationRequest
): Promise<WorkspaceSummary> {
  const res = await client.post<Envelope<WorkspaceSummary>>(paths.workspaces.acceptInvitation, body)
  return res.data.data
}
