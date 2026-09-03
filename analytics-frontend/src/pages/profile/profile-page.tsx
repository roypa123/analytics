import { motion } from "framer-motion"
import { useForm } from "react-hook-form"

import { isApiError } from "@/api/errors"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useChangePassword } from "@/hooks/mutations/use-change-password"
import { useUpdateProfile } from "@/hooks/mutations/use-update-profile"
import { useCurrentAccount } from "@/hooks/queries/use-current-account"
import { fadeUp, staggerContainer } from "@/lib/motion"

function initials(fullName: string | undefined, email: string | undefined): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/)
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return email ? email[0].toUpperCase() : "?"
}

interface ProfileFormValues {
  fullName: string
}

interface PasswordFormValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

// Part 7 §7.10 — the account-level counterpart to the sidebar's disabled
// "Settings" item (workspace/billing settings, still out of scope). Reachable
// from the sidebar's user menu. Two independent forms, matching the two
// independent backend operations (`PATCH /auth/me`, `POST /auth/me/password`)
// — a name change never touches the password hash, and vice versa.
export function ProfilePage() {
  const { data: account, isLoading } = useCurrentAccount()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()

  const profileForm = useForm<ProfileFormValues>({ values: account ? { fullName: account.fullName } : undefined })
  const passwordForm = useForm<PasswordFormValues>()

  const onSaveProfile = profileForm.handleSubmit((values) => {
    updateProfile.mutate({ fullName: values.fullName })
  })

  const onChangePassword = passwordForm.handleSubmit((values) => {
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      { onSuccess: () => passwordForm.reset() }
    )
  })

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex flex-col gap-6 p-6"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account details and password.</p>
      </motion.div>

      <motion.div variants={fadeUp} className="max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Your name and email address.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <form onSubmit={onSaveProfile} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{initials(account?.fullName, account?.email)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{account?.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {account?.emailVerified ? "Verified" : "Not verified"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    autoComplete="name"
                    {...profileForm.register("fullName", {
                      required: "Full name is required",
                      maxLength: { value: 200, message: "Must be 200 characters or fewer" },
                    })}
                  />
                  {profileForm.formState.errors.fullName && (
                    <p className="text-sm text-destructive">
                      {profileForm.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                {isApiError(updateProfile.error) && (
                  <p className="text-sm text-destructive">
                    Something went wrong. Please try again.
                  </p>
                )}
                {updateProfile.isSuccess && (
                  <p className="text-sm text-muted-foreground">Profile updated.</p>
                )}

                <div>
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className="max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>
              Changing your password signs you out on every other device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onChangePassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...passwordForm.register("currentPassword", {
                    required: "Current password is required",
                  })}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register("newPassword", {
                    required: "New password is required",
                    minLength: { value: 12, message: "Password must be at least 12 characters" },
                  })}
                />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register("confirmPassword", {
                    required: "Confirm your new password",
                    validate: (value) =>
                      value === passwordForm.getValues("newPassword") || "Passwords don't match",
                  })}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {isApiError(changePassword.error) && (
                <p className="text-sm text-destructive">
                  {changePassword.error.code === "incorrect_password"
                    ? "Current password is incorrect."
                    : "Something went wrong. Please try again."}
                </p>
              )}
              {changePassword.isSuccess && (
                <p className="text-sm text-muted-foreground">Password changed.</p>
              )}

              <div>
                <Button type="submit" disabled={changePassword.isPending}>
                  {changePassword.isPending ? "Saving…" : "Change password"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
