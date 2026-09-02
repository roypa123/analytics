import { SidebarTrigger } from "@/components/ui/sidebar"

// Part 7 §7.10 — `layout/app-header.tsx`. Account identity and sign-out live
// in the sidebar footer (`layout/user-menu.tsx`) instead of here — one
// discoverable place, not two competing ones.
export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center border-b px-4">
      <SidebarTrigger />
    </header>
  )
}
