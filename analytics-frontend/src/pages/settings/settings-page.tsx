import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { Globe, Plus, UsersRound } from "lucide-react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { isApiError } from "@/api/errors"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAcceptInvitation } from "@/hooks/mutations/use-accept-invitation"
import { useDeleteProperty } from "@/hooks/mutations/use-delete-property"
import { useInviteMember } from "@/hooks/mutations/use-invite-member"
import { useRemoveMember } from "@/hooks/mutations/use-remove-member"
import { useRevokeInvitation } from "@/hooks/mutations/use-revoke-invitation"
import { useUpdateMemberRole } from "@/hooks/mutations/use-update-member-role"
import { useUpdateWorkspace } from "@/hooks/mutations/use-update-workspace"
import { useCurrentAccount } from "@/hooks/queries/use-current-account"
import { useProperties } from "@/hooks/queries/use-properties"
import { useWorkspaceInvitations } from "@/hooks/queries/use-workspace-invitations"
import { useWorkspaceMembers } from "@/hooks/queries/use-workspace-members"
import { useWorkspaces } from "@/hooks/queries/use-workspaces"
import { fadeUp, staggerContainer } from "@/lib/motion"
import type { PropertySummary } from "@/types/api/property"
import type { WorkspaceRole, WorkspaceSummary } from "@/types/api/workspace"
import { EMAIL_PATTERN } from "@/utils/validation"

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

interface PropertyRowProps {
  property: PropertySummary
  isDeleting: boolean
  onConfirmDelete: () => void
}

function PropertyRow({ property, isDeleting, onConfirmDelete }: PropertyRowProps) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
      <div className="flex flex-col">
        <span className="font-medium">{property.name}</span>
        <span className="text-xs text-muted-foreground">{property.domain}</span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {property.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tracking stops immediately and the property disappears from your
              dashboard and reports. Data already collected is kept, but this
              can't be undone from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onConfirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

// Property deletion has no per-role restriction server-side yet
// (`PropertyService` trusts workspace membership — Part 8 §8.7's
// `AuthContext` enforcement layer is still pending, A-18), so every member
// sees the same Delete action here, unlike MembersCard's owner/admin gating.
function PropertiesCard() {
  const { data, isLoading } = useProperties()
  const deleteProperty = useDeleteProperty()
  const properties = data ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Properties</CardTitle>
          <CardDescription>Websites tracked in this workspace.</CardDescription>
        </div>
        <Button size="sm" render={<Link to="/onboarding/property" />}>
          <Plus className="size-4" />
          New property
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : properties.length === 0 ? (
          <Empty className="border-0 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Globe />
              </EmptyMedia>
              <EmptyTitle>No properties yet</EmptyTitle>
              <EmptyDescription>Add a website to start tracking it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {properties.map((property) => (
              <PropertyRow
                key={property.id}
                property={property}
                isDeleting={deleteProperty.isPending && deleteProperty.variables === property.id}
                onConfirmDelete={() => deleteProperty.mutate(property.id)}
              />
            ))}
          </ul>
        )}
        {isApiError(deleteProperty.error) && (
          <p className="mt-3 text-sm text-destructive">Something went wrong. Please try again.</p>
        )}
      </CardContent>
    </Card>
  )
}

interface WorkspaceCardProps {
  workspace: WorkspaceSummary
  canManage: boolean
}

function WorkspaceCard({ workspace, canManage }: WorkspaceCardProps) {
  const updateWorkspace = useUpdateWorkspace(workspace.id)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ name: string }>({ values: { name: workspace.name } })

  const onSubmit = handleSubmit((values) => updateWorkspace.mutate({ name: values.name }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspace</CardTitle>
        <CardDescription>Your workspace's name and plan.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspaceName">Name</Label>
            <Input
              id="workspaceName"
              disabled={!canManage}
              {...register("name", {
                required: "Workspace name is required",
                maxLength: { value: 200, message: "Must be 200 characters or fewer" },
              })}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Plan
            <Badge variant="secondary" className="capitalize">
              {workspace.plan}
            </Badge>
          </div>

          {isApiError(updateWorkspace.error) && (
            <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
          )}
          {updateWorkspace.isSuccess && (
            <p className="text-sm text-muted-foreground">Saved.</p>
          )}

          {canManage && (
            <div>
              <Button type="submit" disabled={updateWorkspace.isPending}>
                {updateWorkspace.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

interface MembersCardProps {
  workspaceId: number
  myRole: WorkspaceRole
  myAccountId: number | undefined
}

// Part 8 §8.6 matrix, enforced identically server-side: only an owner sees a
// role selector (changing a role is owner-only); an owner or admin sees the
// remove action. A plain member sees a read-only list.
function MembersCard({ workspaceId, myRole, myAccountId }: MembersCardProps) {
  const { data, isLoading } = useWorkspaceMembers(workspaceId)
  const updateRole = useUpdateMemberRole(workspaceId)
  const removeMember = useRemoveMember(workspaceId)
  const isOwner = myRole === "owner"
  const canManage = myRole === "owner" || myRole === "admin"
  const members = data ?? []

  const mutationError = updateRole.error ?? removeMember.error
  const errorMessage = isApiError(mutationError)
    ? mutationError.code === "last_owner"
      ? "A workspace must always have at least one owner."
      : "Something went wrong. Please try again."
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Members</CardTitle>
        <CardDescription>Who has access to this workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.accountId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {member.fullName}
                        {member.accountId === myAccountId && (
                          <span className="font-normal text-muted-foreground"> (you)</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{member.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isOwner ? (
                      <Select
                        value={member.workspaceRole}
                        onValueChange={(value) =>
                          updateRole.mutate({
                            accountId: member.accountId,
                            body: { workspaceRole: value as WorkspaceRole },
                          })
                        }
                      >
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABELS[member.workspaceRole]}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember.mutate(member.accountId)}
                        disabled={removeMember.isPending}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {errorMessage && <p className="mt-3 text-sm text-destructive">{errorMessage}</p>}
      </CardContent>
    </Card>
  )
}

interface InviteFormValues {
  email: string
  workspaceRole: WorkspaceRole
}

interface InviteCardProps {
  workspaceId: number
  isOwner: boolean
}

// Part 5-style Phase 1 deviation (no email delivery yet): a successful
// invite reveals its raw token exactly once, right here, for the admin to
// copy and share manually — mirrors `CreatedInvitation`'s wire contract.
function InviteCard({ workspaceId, isOwner }: InviteCardProps) {
  const invite = useInviteMember(workspaceId)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({ defaultValues: { workspaceRole: "member" } })

  const onSubmit = handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: (created) => {
        setCreatedToken(created.inviteToken)
        setCopied(false)
        reset({ email: "", workspaceRole: "member" })
      },
    })
  })

  const copyToken = () => {
    if (!createdToken) return
    void navigator.clipboard.writeText(createdToken).then(() => setCopied(true))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invite a teammate</CardTitle>
        <CardDescription>
          There's no email delivery yet — copy the invite token below and share it yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="inviteEmail">Email</Label>
            <Input
              id="inviteEmail"
              type="email"
              autoComplete="off"
              {...register("email", {
                required: "Email is required",
                pattern: { value: EMAIL_PATTERN, message: "Enter a valid email address" },
              })}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inviteRole">Role</Label>
            <Controller
              control={control}
              name="workspaceRole"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="inviteRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </form>

        {isApiError(invite.error) && (
          <p className="text-sm text-destructive">
            {invite.error.code === "invitation_pending"
              ? "There is already a pending invitation for this email."
              : "Something went wrong. Please try again."}
          </p>
        )}

        {createdToken && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">
              Invite created. Share this token — it won't be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 text-xs">
                {createdToken}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyToken}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface PendingInvitationsCardProps {
  workspaceId: number
}

function PendingInvitationsCard({ workspaceId }: PendingInvitationsCardProps) {
  const { data, isLoading } = useWorkspaceInvitations(workspaceId)
  const revoke = useRevokeInvitation(workspaceId)
  const invitations = data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pending invitations</CardTitle>
        <CardDescription>Invitations that haven't been accepted yet.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : invitations.length === 0 ? (
          <Empty className="border-0 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRound />
              </EmptyMedia>
              <EmptyTitle>No pending invitations</EmptyTitle>
              <EmptyDescription>Invite a teammate above to see it here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{invitation.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABELS[invitation.workspaceRole]} · expires{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke.mutate(invitation.id)}
                  disabled={revoke.isPending}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AcceptInvitationCard() {
  const accept = useAcceptInvitation()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ token: string }>()

  const onSubmit = handleSubmit((values) => {
    accept.mutate(values, { onSuccess: () => reset() })
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Have an invite?</CardTitle>
        <CardDescription>
          Paste the invite token someone shared with you to join their workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="acceptToken">Invite token</Label>
            <Input id="acceptToken" {...register("token", { required: "Paste an invite token" })} />
            {errors.token && <p className="text-sm text-destructive">{errors.token.message}</p>}
          </div>
          <Button type="submit" disabled={accept.isPending}>
            {accept.isPending ? "Joining…" : "Join workspace"}
          </Button>
        </form>
        {isApiError(accept.error) && (
          <p className="text-sm text-destructive">
            {accept.error.code === "invitation_email_mismatch"
              ? "This invitation was sent to a different email address."
              : accept.error.code === "invitation_not_found"
                ? "That invite token is invalid or has expired."
                : "Something went wrong. Please try again."}
          </p>
        )}
        {accept.isSuccess && accept.data && (
          <p className="text-sm text-muted-foreground">Joined {accept.data.name}.</p>
        )}
      </CardContent>
    </Card>
  )
}

// Settings: account-level counterpart is `/profile`; this page is
// workspace-level (Part 8 §8.2-§8.3, §8.6, §8.8). No workspace-switcher UI
// yet (D-25), so — same simplification `useProperties()` already makes —
// this operates on the first workspace `GET /workspaces` returns.
export function SettingsPage() {
  const { data: account } = useCurrentAccount()
  const { data: workspaces, isLoading } = useWorkspaces()
  const workspace = workspaces?.[0]

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex flex-col gap-6 p-6"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your workspace, members, and invitations.
        </p>
      </motion.div>

      {isLoading || !workspace ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <motion.div variants={fadeUp}>
            <PropertiesCard />
          </motion.div>

          <motion.div variants={fadeUp} className="max-w-xl">
            <WorkspaceCard
              workspace={workspace}
              canManage={workspace.myRole === "owner" || workspace.myRole === "admin"}
            />
          </motion.div>

          <motion.div variants={fadeUp}>
            <MembersCard
              workspaceId={workspace.id}
              myRole={workspace.myRole}
              myAccountId={account?.id}
            />
          </motion.div>

          {(workspace.myRole === "owner" || workspace.myRole === "admin") && (
            <>
              <motion.div variants={fadeUp} className="max-w-2xl">
                <InviteCard workspaceId={workspace.id} isOwner={workspace.myRole === "owner"} />
              </motion.div>

              <motion.div variants={fadeUp}>
                <PendingInvitationsCard workspaceId={workspace.id} />
              </motion.div>
            </>
          )}

          <motion.div variants={fadeUp} className="max-w-xl">
            <AcceptInvitationCard />
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
