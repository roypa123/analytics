import { ChevronDown, LogOut } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useCurrentAccount } from "@/hooks/queries/use-current-account"
import { useLogout } from "@/hooks/mutations/use-logout"

// Part 7 §7.10 — `layout/app-header.tsx`. A full `user-menu.tsx` with avatar
// and workspace context lands once workspace switching exists (Part 8 §8.8);
// for now this is the sidebar toggle plus the one action that exists —
// signing out.
export function AppHeader() {
  const { data: account } = useCurrentAccount()
  const logout = useLogout()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <SidebarTrigger />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <span className="max-w-40 truncate">{account?.email}</span>
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{account?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
