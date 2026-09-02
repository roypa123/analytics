import { Link, useNavigate } from "@tanstack/react-router"
import { motion, useReducedMotion } from "framer-motion"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isApiError } from "@/api/errors"
import { AnalyticsHero } from "@/components/illustrations/analytics-hero"
import { GridGlow } from "@/components/illustrations/grid-glow"
import { Logo } from "@/components/illustrations/logo"
import { useRegister } from "@/hooks/mutations/use-register"
import { fadeUp } from "@/lib/motion"

interface RegisterFormValues {
  organisationName: string
  fullName: string
  email: string
  password: string
}

// Part 8 §8.1, §8.8 — the standalone signup path (as opposed to a teammate
// registering to accept an invitation, which does not exist as a route yet
// and never shows this field): collects the organisation name explicitly
// rather than deriving a hidden workspace name from full_name.
export function RegisterPage() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const registerAccount = useRegister()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>()

  const onSubmit = handleSubmit((values) => {
    registerAccount.mutate(values, {
      onSuccess: () => {
        void navigate({ to: "/dashboard" })
      },
    })
  })

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden items-center justify-center overflow-hidden bg-muted/40 lg:flex">
        <GridGlow />
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, scale: 0.94 }}
          animate={
            reduceMotion
              ? { opacity: 1, scale: 1 }
              : { opacity: 1, scale: 1, y: [0, -10, 0] }
          }
          transition={
            reduceMotion
              ? { duration: 0.4 }
              : {
                  default: { duration: 0.6, ease: "easeOut" },
                  y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.6 },
                }
          }
          className="relative z-10 w-full max-w-sm px-10"
        >
          <AnalyticsHero className="w-full drop-shadow-xl" />
        </motion.div>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-16">
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="w-full max-w-sm"
        >
          <Link to="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Create your workspace</CardTitle>
              <CardDescription>
                Start tracking your sites — free, no credit card required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="organisationName">Organisation name</Label>
                  <Input
                    id="organisationName"
                    autoComplete="organization"
                    placeholder="Acme Inc."
                    {...register("organisationName", {
                      required: "Organisation name is required",
                    })}
                  />
                  {errors.organisationName && (
                    <p className="text-sm text-destructive">
                      {errors.organisationName.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    autoComplete="name"
                    {...register("fullName", { required: "Full name is required" })}
                  />
                  {errors.fullName && (
                    <p className="text-sm text-destructive">{errors.fullName.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...register("email", { required: "Email is required" })}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    {...register("password", {
                      required: "Password is required",
                      minLength: { value: 12, message: "Password must be at least 12 characters" },
                    })}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>
                {isApiError(registerAccount.error) && (
                  <p className="text-sm text-destructive">
                    {registerAccount.error.code === "email_taken"
                      ? "An account with this email already exists."
                      : "Something went wrong. Please try again."}
                  </p>
                )}
                <Button type="submit" disabled={registerAccount.isPending} className="w-full">
                  {registerAccount.isPending ? "Creating account…" : "Create account"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
