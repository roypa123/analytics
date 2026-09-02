import { Outlet } from "@tanstack/react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"

// Part 7 §7.10 — `layout/app-shell.tsx`. Composes sidebar + header +
// <Outlet/>. Wraps only the property-scoped pages (dashboard, and later
// reports/realtime/settings) — the onboarding wizard (create-property,
// install-snippet) renders full-page instead, since there's nothing to
// switch between until a property exists.
export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
