import Link from "next/link"

import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { NavLinks, type NavLink } from "@/features/nav/components/NavLinks"

const LINKS: NavLink[] = [
  { href: "/demo", rotulo: "Painel", exato: true },
  { href: "/demo/torneios", rotulo: "Torneios" },
  { href: "/demo/ligas", rotulo: "Pirâmides" },
  { href: "/demo/copas", rotulo: "Copas" },
  { href: "/demo/explorar", rotulo: "Explorar" },
]

/**
 * Header da demonstração: marca → `/demo`, navegação (`NavLinks` reusado),
 * troca de tema e um CTA ESTÁTICO "Criar conta" (nunca o `AccountMenu` real, que
 * importa a action de logout).
 */
export function DemoNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link
          href="/demo"
          prefetch={false}
          className="font-display text-base font-bold tracking-[0.25em] text-foreground"
        >
          GOLISEU<span className="text-primary">.</span>
        </Link>

        <NavLinks links={LINKS} />

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          <Button size="sm" variant="outline" asChild>
            <Link href="/cadastro">Criar conta</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
