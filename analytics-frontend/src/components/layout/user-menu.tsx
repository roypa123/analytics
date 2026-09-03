import { useNavigate } from "@tanstack/react-router"
import { ChevronsUpDown, LogOut, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useLogout } from "@/hooks/mutations/use-logout"
import { useCurrentAccount } from "@/hooks/queries/use-current-account"

function initials(fullName: string | undefined, email: string | undefined): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/)
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return email ? email[0].toUpperCase() : "?"
}

// Part 7 §7.10 — `layout/user-menu.tsx`. The sidebar footer is the standard
// place for account identity + sign out (Linear/Notion/Vercel-style), more
// discoverable than a small text dropdown buried in the header.
export function UserMenu() {
  const navigate = useNavigate()
  const { data: account, isLoading } = useCurrentAccount()
  const logout = useLogout()

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
              <Avatar size="sm">
                <AvatarFallback>{initials(account?.fullName, account?.email)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm font-medium">
                  {isLoading ? "Loading…" : (account?.fullName ?? account?.email)}
                </span>
                <span className="truncate text-xs text-muted-foreground">{account?.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{account?.email}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate({ to: "/profile" })}>
                <User />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
