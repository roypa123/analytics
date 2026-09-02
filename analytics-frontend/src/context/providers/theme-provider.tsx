import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { themeAtom } from "@/context/atoms/theme"

// Toggles the `.dark` class on <html> to match index.css's
// `@custom-variant dark (&:is(.dark *))` (Part 0 §0.3.5).
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAtomValue(themeAtom)

  useEffect(() => {
    const root = document.documentElement
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const isDark = theme === "dark" || (theme === "system" && prefersDark)
    root.classList.toggle("dark", isDark)
  }, [theme])

  return children
}
