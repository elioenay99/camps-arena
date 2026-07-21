"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, House, Layers, Trophy, type LucideIcon } from "lucide-react"

interface DestinoInferior {
  href: string
  rotulo: string
  Icone: LucideIcon
  /** "/dashboard" ativaria em TODA rota do segmento — exige igualdade exata. */
  exato?: boolean
}

/**
 * Destinos de uso diário. Declarados AQUI, e não recebidos por prop do layout
 * (RSC) que já mantém a lista do header: os ícones são componentes, e passar
 * componente de client comp pela fronteira RSC é a classe de bug que custou a
 * change fix-editar-placar-rsc (chegava com isValidElement=false e sumia sem
 * erro). A duplicação dos quatro href é deliberada e coberta por teste.
 *
 * Copas e "Nova partida" ficam fora: seguem alcançáveis pelo menu do header,
 * que continua existindo (e é a navegação inteira do desktop).
 */
const DESTINOS: DestinoInferior[] = [
  { href: "/dashboard", rotulo: "Painel", Icone: House, exato: true },
  { href: "/dashboard/torneios", rotulo: "Torneios", Icone: Trophy },
  { href: "/dashboard/ligas", rotulo: "Pirâmides", Icone: Layers },
  { href: "/dashboard/explorar", rotulo: "Explorar", Icone: Compass },
]

/**
 * Barra de navegação fixa no rodapé — SÓ no mobile, SÓ na subárvore autenticada.
 * Antes dela, trocar de seção no celular custava abrir o hambúrguer no canto
 * superior (longe do polegar), ler a lista e só então tocar o destino; e não
 * havia como saber onde se estava sem abrir o menu.
 *
 * O `id` é contrato: `globals.css` usa `body:has(#nav-inferior)` para levantar o
 * toast acima da barra apenas nas rotas que a têm (o container do sonner é
 * `fixed` com z-index 999999999 e cobriria os alvos de toque). Renomear o id sem
 * atualizar o CSS devolve o toast para cima da navegação.
 */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      id="nav-inferior"
      aria-label="Navegação principal (rodapé)"
      // pb da área segura: `fixed` mede da VIEWPORT e ignora o padding-bottom
      // que o body já paga — sem o inset aqui, a barra ficaria sob o indicador
      // de gestos na PWA instalada.
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="flex list-none items-stretch p-0">
        {DESTINOS.map(({ href, rotulo, Icone, exato }) => {
          const ativo = exato
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                // Sem prefetch, pela mesma razão do menu do header: a barra
                // aparece em TODA página e prefetcharia as 4 rotas de seção (RSC
                // caras) de uma vez — a rajada estourava a borda da Vercel (503).
                prefetch={false}
                aria-current={ativo ? "page" : undefined}
                className={`flex h-[var(--nav-inferior-faixa)] flex-col items-center justify-center gap-0.5 text-[0.6875rem] transition-colors ${
                  ativo
                    ? "font-medium text-foreground dark:text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <Icone
                  aria-hidden="true"
                  className={`size-5 ${ativo ? "text-primary" : ""}`}
                />
                {rotulo}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
