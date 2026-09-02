import { Button } from "@/components/ui/button"
import { useCurrentAccount } from "@/hooks/queries/use-current-account"
import { useLogout } from "@/hooks/mutations/use-logout"

// Placeholder for the Tier-1 overview (Part 1 §1.2). Proves the auth
// vertical slice end-to-end: protected route → authenticated request →
// account data rendered.
export function DashboardPage() {
  const { data: account, isLoading } = useCurrentAccount()
  const logout = useLogout()

  return (
    <div className="flex min-h-dvh flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sign out
        </Button>
      </header>
      <p className="text-muted-foreground">
        {isLoading ? "Loading…" : `Signed in as ${account?.email}`}
      </p>
    </div>
  )
}
