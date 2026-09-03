import { motion } from "framer-motion"
import { Globe, Plus, UsersRound } from "lucide-react"
import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { TrackingSnippetBlock } from "@/components/analytics/tracking-snippet-block"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"
import { useAcceptInvitation } from "@/hooks/mutations/use-accept-invitation"
import { useCreateProperty } from "@/hooks/mutations/use-create-property"
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
import { useSelectedWorkspace } from "@/hooks/use-selected-workspace"
import { fadeUp, staggerContainer } from "@/lib/motion"
import type { CreatePropertyRequest, PropertySummary } from "@/types/api/property"
import type { PropertyRole, WorkspaceRole, WorkspaceSummary } from "@/types/api/workspace"
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
      <div className="flex items-center gap-1">
        <Dialog>
          <DialogTrigger render={<Button variant="ghost" size="sm" />}>Snippet</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tracking snippet</DialogTitle>
              <DialogDescription>
                Add this to every page of {property.domain}, just before the closing head tag.
              </DialogDescription>
            </DialogHeader>
            <TrackingSnippetBlock trackingId={property.trackingId} />
          </DialogContent>
        </Dialog>
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
      </div>
    </li>
  )
}

interface AddPropertyFormValues {
  name: string
  domain: string
}

// Adding a 2nd/3rd/... property used to route through the full-screen
// "Create your first property" onboarding wizard (only ever meant to run
// once, right after signup) and then strand the user on the install-snippet
// page with no way back — from Settings it read as if only one property
// could ever be added. This dialog does the same create call inline, shows
// the new snippet immediately, and never leaves the page.
function AddPropertyDialog() {
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<PropertySummary | null>(null)
  const createProperty = useCreateProperty()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddPropertyFormValues>()

  const onSubmit = handleSubmit((values: CreatePropertyRequest) => {
    createProperty.mutate(values, { onSuccess: (property) => setCreated(property) })
  })

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // Deferred so the dialog doesn't visibly flash back to the empty form
      // while it's still closing.
      setTimeout(() => {
        setCreated(null)
        reset()
        createProperty.reset()
      }, 150)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        New property
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{created.name} is ready</DialogTitle>
              <DialogDescription>
                Add this snippet to every page of {created.domain} to start tracking it.
              </DialogDescription>
            </DialogHeader>
            <TrackingSnippetBlock trackingId={created.trackingId} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New property</DialogTitle>
              <DialogDescription>A property is one tracked website.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="propertyName">Property name</Label>
                <Input
                  id="propertyName"
                  autoComplete="off"
                  placeholder="My Website"
                  {...register("name", {
                    required: "Property name is required",
                    maxLength: { value: 200, message: "Must be 200 characters or fewer" },
                  })}
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="propertyDomain">Domain</Label>
                <Input
                  id="propertyDomain"
                  autoComplete="off"
                  placeholder="example.com"
                  {...register("domain", {
                    required: "Domain is required",
                    maxLength: { value: 255, message: "Must be 255 characters or fewer" },
                  })}
                />
                {errors.domain && (
                  <p className="text-sm text-destructive">{errors.domain.message}</p>
                )}
              </div>
              {isApiError(createProperty.error) && (
                <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={createProperty.isPending}>
                  {createProperty.isPending ? "Creating…" : "Create property"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
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
        <AddPropertyDialog />
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
              {members.map((member) => {
                // Part 8 §8.6 (revised): an admin manages roles the same as
                // an owner for the ordinary member/admin case — the one
                // reserved move is anything touching the "owner" role, which
                // only the owner can grant or take away. So an admin gets an
                // editable select on every row except the current owner's,
                // and never sees "Owner" as an option to pick.
                const canEditRole = canManage && (isOwner || member.workspaceRole !== "owner")
                return (
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
                      {canEditRole ? (
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
                            {isOwner && <SelectItem value="owner">Owner</SelectItem>}
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
                )
              })}
            </TableBody>
          </Table>
        )}
        {errorMessage && <p className="mt-3 text-sm text-destructive">{errorMessage}</p>}
      </CardContent>
    </Card>
  )
}

interface TeamSectionProps {
  workspaceId: number
  isOrganisation: boolean
  myRole: WorkspaceRole
  myAccountId: number | undefined
}

// Part 8 §8.1 (D-19, revised): "B2C / solo ... No teammates, no invitations,
// no permission UI" for an Individual-tab signup — Members/Invite/Pending-
// invitations are hidden entirely rather than shown with nothing to manage.
// An Organisation-tab signup shows them immediately (still gated by role, as
// before), since that's the whole point of picking that tab. Gated on the
// signup-time `isOrganisation` flag (D-25's tab choice), not live seat count:
// gating on seat count alone made the very first invite unreachable for
// every workspace, individual or organisation, since a brand-new org has
// exactly one member too.
function TeamSection({ workspaceId, isOrganisation, myRole, myAccountId }: TeamSectionProps) {
  const canManage = myRole === "owner" || myRole === "admin"

  if (!isOrganisation) {
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      <MembersCard workspaceId={workspaceId} myRole={myRole} myAccountId={myAccountId} />
      {canManage && (
        <>
          <div className="max-w-2xl">
            <InviteCard workspaceId={workspaceId} isOwner={myRole === "owner"} />
          </div>
          <PendingInvitationsCard workspaceId={workspaceId} />
        </>
      )}
    </div>
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

const PROPERTY_ROLE_LABELS: Record<PropertyRole, string> = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
}

// Part 5-style Phase 1 deviation (no email delivery yet): a successful
// invite reveals its raw token exactly once, right here, for the admin to
// copy and share manually — mirrors `CreatedInvitation`'s wire contract.
function InviteCard({ workspaceId, isOwner }: InviteCardProps) {
  const invite = useInviteMember(workspaceId)
  const { data: properties } = useProperties()
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Only meaningful for a "member" invite (rule 1, Part 8 §8.6: an
  // owner/admin invitee already sees every property) — keyed by property id,
  // a missing entry means "no access to this one."
  const [propertyRoles, setPropertyRoles] = useState<Record<number, PropertyRole>>({})
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({ defaultValues: { workspaceRole: "member" } })
  const workspaceRole = useWatch({ control, name: "workspaceRole" })

  const onSubmit = handleSubmit((values) => {
    const propertyGrants = Object.entries(propertyRoles).map(([propertyId, propertyRole]) => ({
      propertyId: Number(propertyId),
      propertyRole,
    }))
    invite.mutate(
      { ...values, propertyGrants },
      {
        onSuccess: (created) => {
          setCreatedToken(created.inviteToken)
          setCopied(false)
          setPropertyRoles({})
          reset({ email: "", workspaceRole: "member" })
        },
      }
    )
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

        {workspaceRole === "member" && (properties?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Property access</p>
            <p className="text-xs text-muted-foreground">
              A member only sees the properties granted here — pick a role for each one
              they should access, and leave the rest set to "No access."
            </p>
            <ul className="flex flex-col gap-2">
              {properties?.map((property) => (
                <li key={property.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{property.name}</span>
                  <Select
                    value={propertyRoles[property.id] ?? "none"}
                    onValueChange={(value: string | null) =>
                      setPropertyRoles((current) => {
                        const next = { ...current }
                        if (value === "none" || value === null) {
                          delete next[property.id]
                        } else {
                          next[property.id] = value as PropertyRole
                        }
                        return next
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No access</SelectItem>
                      {Object.entries(PROPERTY_ROLE_LABELS).map(([role, label]) => (
                        <SelectItem key={role} value={role}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          </div>
        )}

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
// workspace-level (Part 8 §8.2-§8.3, §8.6, §8.8). An account can belong to
// more than one workspace (its own, plus any it's been invited into), so
// which one Settings shows is an explicit selection (`useSelectedWorkspace`,
// with a `<WorkspaceSwitcher>` once there's more than one) rather than
// blindly taking `workspaces[0]` — that used to land an invited teammate on
// their own empty personal workspace instead of the org they were invited to.
export function SettingsPage() {
  const { data: account } = useCurrentAccount()
  const { workspace, isLoading } = useSelectedWorkspace()

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex flex-col gap-6 p-6"
    >
      <motion.div
        variants={fadeUp}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your workspace, members, and invitations.
          </p>
        </div>
        <WorkspaceSwitcher />
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
            <TeamSection
              workspaceId={workspace.id}
              isOrganisation={workspace.isOrganisation}
              myRole={workspace.myRole}
              myAccountId={account?.id}
            />
          </motion.div>

          <motion.div variants={fadeUp} className="max-w-xl">
            <AcceptInvitationCard />
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
