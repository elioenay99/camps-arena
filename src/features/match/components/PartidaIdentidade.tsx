import type { ReactNode } from "react"

import { TeamCrest } from "@/features/team/components/TeamCrest"
import { cn } from "@/lib/utils"

/**
 * Rótulo de rodada/fase de uma partida (`G2 R3 ida`). `null` em partida avulsa
 * (sem rodada) — a UI simplesmente não desenha o rótulo. Centralizado porque as
 * duas listas (aberta e encerrada) montavam a mesma string à mão.
 */
export function rotuloRodada({
  rodada,
  grupo,
  perna,
}: {
  rodada: number | null
  grupo?: number | null
  perna?: number | null
}) {
  if (rodada === null) return null
  const prefixo = grupo != null ? `G${grupo} ` : ""
  const sufixo = perna != null ? (perna === 1 ? " ida" : " volta") : ""
  return `${prefixo}R${rodada}${sufixo}`
}

/**
 * Identidade visual de uma partida, compartilhada pelas listas de aberta e
 * encerrada: rodada · escudo · [nome] · miolo (placar/W.O.) · escudo · [nome].
 *
 * Mobile-first: no celular a identificação é o ESCUDO (`TeamCrest` já cai em
 * iniciais + cor estável quando não há escudo cadastrado — clube sem escudo,
 * torneio por nome e avulso continuam identificáveis) e o nome só aparece de
 * `sm:` para cima. O nome permanece no DOM em todos os breakpoints: a ocultação
 * é puramente CSS. O bloco é decorativo (`aria-hidden`) — a leitura acessível
 * do resultado é o `sr-only` de cada consumidor.
 *
 * Server Component: não introduza estado aqui (as duas listas são RSC e
 * `OpenMatchesList` depende disso para conter o celular do adversário).
 */
export function PartidaIdentidade({
  rodadaLabel,
  nome1,
  nome2,
  escudo1,
  escudo2,
  destaque1 = false,
  destaque2 = false,
  className,
  children,
}: {
  rodadaLabel?: string | null
  nome1: string
  nome2: string
  escudo1?: string | null
  escudo2?: string | null
  /** Realce do lado (vencedor de W.O.). */
  destaque1?: boolean
  destaque2?: boolean
  className?: string
  /** Miolo da linha: placar dominante ou badge de W.O. */
  children: ReactNode
}) {
  return (
    <span
      className={cn("flex min-w-0 items-center gap-2", className)}
      aria-hidden="true"
    >
      {rodadaLabel ? (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {rodadaLabel}
        </span>
      ) : null}
      <TeamCrest nome={nome1} escudoUrl={escudo1} size={24} />
      <span className={cn("hidden min-w-0 truncate sm:inline", destaque1 && "font-semibold")}>
        {nome1}
      </span>
      {children}
      <TeamCrest nome={nome2} escudoUrl={escudo2} size={24} />
      <span className={cn("hidden min-w-0 truncate sm:inline", destaque2 && "font-semibold")}>
        {nome2}
      </span>
    </span>
  )
}
