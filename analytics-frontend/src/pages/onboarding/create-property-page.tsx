import { useNavigate } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isApiError } from "@/api/errors"
import { Logo } from "@/components/illustrations/logo"
import { useCreateProperty } from "@/hooks/mutations/use-create-property"
import { fadeUp } from "@/lib/motion"

interface CreatePropertyFormValues {
  name: string
  domain: string
}

// Part 8 §8.8 — the step right after signup: "create first property →
// tracking snippet → install verification." Property fields are validated
// here (Rule R-14) and again in CreatePropertyRequest (app/schemas/property.py).
export function CreatePropertyPage() {
  const navigate = useNavigate()
  const createProperty = useCreateProperty()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreatePropertyFormValues>()

  const onSubmit = handleSubmit((values) => {
    createProperty.mutate(values, {
      onSuccess: (property) => {
        void navigate({
          to: "/onboarding/snippet",
          search: { trackingId: property.trackingId },
        })
      },
    })
  })

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-16">
      <motion.div initial="hidden" animate="show" variants={fadeUp} className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Create your first property</CardTitle>
            <CardDescription>
              A property is one tracked website. You can add more later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Property name</Label>
                <Input
                  id="name"
                  autoComplete="off"
                  placeholder="My Website"
                  {...register("name", {
                    required: "Property name is required",
                    maxLength: { value: 200, message: "Must be 200 characters or fewer" },
                  })}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
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
              <Button type="submit" disabled={createProperty.isPending} className="w-full">
                {createProperty.isPending ? "Creating…" : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
