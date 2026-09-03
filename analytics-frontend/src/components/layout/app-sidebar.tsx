import { Link, useRouterState } from "@tanstack/react-router"
import { Activity, BarChart3, LayoutDashboard, Settings } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Logo } from "@/components/illustrations/logo"
import { UserMenu } from "@/components/layout/user-menu"

// Part 7 §7.10 — `layout/app-sidebar.tsx`, built on `ui/sidebar`. Split by
// `enabled` rather than a shared `to` field: a disabled item wouldn't carry
// a `to` typed against the route tree at all — kept for the next item that
// needs the "listed but not built yet" treatment.
const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, enabled: true, to: "/dashboard" },
  { label: "Reports", icon: BarChart3, enabled: true, to: "/reports" },
  { label: "Realtime", icon: Activity, enabled: true, to: "/realtime" },
  { label: "Settings", icon: Settings, enabled: true, to: "/settings" },
] as const

export function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <Logo
            className="group-data-[collapsible=icon]:hidden"
            iconClassName="size-5"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.label}>
                  {item.enabled ? (
                    <SidebarMenuButton
                      isActive={pathname === item.to}
                      tooltip={item.label}
                      render={<Link to={item.to} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      disabled
                      tooltip={`${item.label} — coming soon`}
                      aria-disabled="true"
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <UserMenu />
    </Sidebar>
  )
}
