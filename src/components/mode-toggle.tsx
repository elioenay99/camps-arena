"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { setTheme, resolvedTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Alternar tema"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Visibilidade por CSS via classe .dark — sem flicker e sem hidratação divergente */}
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
      <span className="sr-only">Alternar tema</span>
    </Button>
  )
}
