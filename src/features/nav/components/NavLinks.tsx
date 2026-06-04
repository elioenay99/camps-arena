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
                className={`rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                  ativo
                    ? // text-foreground + peso: no light o bg-accent quase some
                      // sobre o background — o ativo não pode depender só dele.
                      "bg-accent font-medium text-foreground"
                    : "text-muted-foreground"
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
