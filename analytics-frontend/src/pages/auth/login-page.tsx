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
import { useLogin } from "@/hooks/mutations/use-login"
import { fadeUp } from "@/lib/motion"
import { loginRoute } from "@/routing/routes/login.route"

interface LoginFormValues {
  email: string
  password: string
}

export function LoginPage() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const search = loginRoute.useSearch()
  const login = useLogin()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>()

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => {
        void navigate({ to: search.redirect ?? "/dashboard" })
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
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Access your analytics workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                {/* Part 8 §8.4 — generic message; never confirm which field was wrong */}
                {isApiError(login.error) && (
                  <p className="text-sm text-destructive">Invalid email or password.</p>
                )}
                <Button type="submit" disabled={login.isPending} className="w-full">
                  {login.isPending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
