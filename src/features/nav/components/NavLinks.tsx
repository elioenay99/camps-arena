"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export interface NavLink {
  href: string
  rotulo: string
  /** "/dashboard" ativaria em TODA rota do segmento — exige igualdade exata. */
  exato?: boolean
}

/**
 * Única folha client do shell: `usePathname` para sinalizar o item ativo
 * (`aria-current="page"`). Os links chegam como dados — zero lógica de rota
 * aqui além da comparação.
 */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegação principal">
      <ul className="flex list-none flex-wrap items-center gap-1 p-0">
        {links.map((link) => {
          const ativo = link.exato
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={ativo ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  ativo
                    ? // Pill do primário: legível e inconfundível nos dois temas,
                      // sem depender do bg-accent que quase some no light.
                      "bg-primary/12 font-medium text-foreground dark:text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.rotulo}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
