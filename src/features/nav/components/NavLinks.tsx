"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Menu, X } from "lucide-react"

export interface NavLink {
  href: string
  rotulo: string
  /** "/dashboard" ativaria em TODA rota do segmento — exige igualdade exata. */
  exato?: boolean
}

/**
 * Única folha client do shell. No desktop (`sm+`) é a faixa de links inline
 * (item ativo por `aria-current="page"`, via `usePathname`). No mobile colapsa
 * num **disclosure leve** (NÃO `role=menu`): um botão hambúrguer revela a `<ul>`
 * como dropdown. A `<ul>` nunca é desmontada (segue no DOM p/ testes/hidratação);
 * colapsada, some por CSS (`hidden`/`display:none`) — e portanto sai da a11y tree,
 * comportamento esperado de um disclosure fechado. Landmarks `<nav>`/`<ul>`/`<Link>`
 * preservados; toggle de tema, avatar e "Sair" seguem no cabeçalho (fora daqui).
 */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)
  const navRef = useRef<HTMLElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const listaRef = useRef<HTMLUListElement | null>(null)
  const montou = useRef(false)

  // Fecha ao navegar: o pathname muda quando um link é seguido. Sync com um
  // sistema externo (a rota), não estado derivado de props.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAberto(false)
  }, [pathname])

  // Foco: ao ABRIR, vai para o 1º link; ignora a montagem inicial (sem roubar
  // foco no load).
  useEffect(() => {
    if (!montou.current) {
      montou.current = true
      return
    }
    if (aberto) listaRef.current?.querySelector("a")?.focus()
  }, [aberto])

  // Esc e apontar fora fecham (só com o menu aberto). O Esc devolve o foco ao
  // toggle (retorno de foco); o clique fora não rouba o foco.
  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAberto(false)
        toggleRef.current?.focus()
      }
    }
    function aoApontarFora(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener("keydown", aoTeclar)
    document.addEventListener("pointerdown", aoApontarFora)
    return () => {
      document.removeEventListener("keydown", aoTeclar)
      document.removeEventListener("pointerdown", aoApontarFora)
    }
  }, [aberto])

  return (
    <nav
      aria-label="Navegação principal"
      ref={navRef}
      className="relative sm:static"
    >
      {/* Toggle hambúrguer: só no mobile. Alvo de toque de 44px. */}
      <button
        type="button"
        ref={toggleRef}
        aria-label={aberto ? "Fechar menu de seções" : "Abrir menu de seções"}
        aria-expanded={aberto}
        aria-controls="nav-secoes"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground sm:hidden"
      >
        {aberto ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <Menu aria-hidden="true" className="size-5" />
        )}
      </button>

      <ul
        id="nav-secoes"
        ref={listaRef}
        className={`${
          aberto ? "flex" : "hidden"
        } absolute top-full left-0 z-50 mt-2 min-w-44 list-none flex-col gap-1 rounded-xl border bg-popover p-2 shadow-lg ring-1 ring-foreground/10 sm:static sm:mt-0 sm:flex sm:min-w-0 sm:flex-row sm:flex-wrap sm:items-center sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:ring-0`}
      >
        {links.map((link) => {
          const ativo = link.exato
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                // Sem prefetch: a nav aparece em TODA página e prefetcharia as
                // ~6 rotas de seção (RSC caras) de uma vez; a rajada estourava
                // a borda da Vercel (503). Ver add-dashboard-prefetch-hardening.
                prefetch={false}
                aria-current={ativo ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-sm transition-colors ${
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
