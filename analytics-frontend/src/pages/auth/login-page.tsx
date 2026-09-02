import { Link, useNavigate } from "@tanstack/react-router"
import { motion, useReducedMotion } from "framer-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isApiError } from "@/api/errors"
import { AnalyticsHero } from "@/components/illustrations/analytics-hero"
import { GridGlow } from "@/components/illustrations/grid-glow"
import { Logo } from "@/components/illustrations/logo"
import { useLogin } from "@/hooks/mutations/use-login"
import { fadeUp } from "@/lib/motion"
import { loginRoute } from "@/routing/routes/login.route"

type AccountType = "individual" | "organisation"

interface LoginFormValues {
  email: string
  password: string
  organisationName?: string
}

// Part 8 §8.8, D-25 — the Individual/Organisation tabs mirror register's.
// The Organisation tab adds an organisation-name field: the account must
// hold a membership in a workspace with that exact name, checked
// server-side after the password (AuthService.login), or the login is
// rejected with `organisation_mismatch` even though the credentials matched.
export function LoginPage() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const search = loginRoute.useSearch()
  const login = useLogin()
  const [accountType, setAccountType] = useState<AccountType>("individual")
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>()

  const onSubmit = handleSubmit((values) => {
    login.mutate(
      {
        email: values.email,
        password: values.password,
        organisationName: accountType === "organisation" ? values.organisationName : undefined,
      },
      {
        onSuccess: () => {
          void navigate({ to: search.redirect ?? "/dashboard" })
        },
      }
    )
  })

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden items-center justify-center overflow-hidden bg-muted/40 lg:flex">
        <GridGlow />
        <Link to="/" className="absolute left-8 top-8 z-10">
          <Logo />
        </Link>
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
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                {accountType === "organisation"
                  ? "Sign in to your organisation's workspace."
                  : "Access your analytics workspace."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={accountType}
                onValueChange={(value) => setAccountType(value as AccountType)}
                className="mb-5"
              >
                <TabsList className="w-full">
                  <TabsTrigger value="individual" className="flex-1">
                    Individual
                  </TabsTrigger>
                  <TabsTrigger value="organisation" className="flex-1">
                    Organisation
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                {accountType === "organisation" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="organisationName">Organisation</Label>
                    <Input
                      id="organisationName"
                      autoComplete="organization"
                      placeholder="Acme Inc."
                      {...register("organisationName", {
                        required:
                          accountType === "organisation"
                            ? "Organisation is required"
                            : false,
                      })}
                    />
                    {errors.organisationName && (
                      <p className="text-sm text-destructive">
                        {errors.organisationName.message}
                      </p>
                    )}
                  </div>
                )}
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
                    autoComplete="current-password"
                    {...register("password", { required: "Password is required" })}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>
                {/* Part 8 §8.4 — generic message for bad credentials; never
                    confirm which field was wrong. organisation_mismatch is
                    specific since credentials already passed at that point. */}
                {isApiError(login.error) && (
                  <p className="text-sm text-destructive">
                    {login.error.code === "organisation_mismatch"
                      ? "This account has no matching organisation."
                      : "Invalid email or password."}
                  </p>
                )}
                <Button type="submit" disabled={login.isPending} className="w-full">
                  {login.isPending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
                  Sign up
                </Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
