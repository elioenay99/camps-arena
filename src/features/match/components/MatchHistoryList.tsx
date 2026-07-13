import {
  ArtilheirosEncerrada,
  type LadoEditavel,
} from "@/features/match/components/ArtilheirosEncerrada"
import { CompartilharResultadoButton } from "@/features/match/components/CompartilharResultadoButton"
import { MatchStatusButton } from "@/features/match/components/MatchStatusButton"
import { RoundPager } from "@/features/match/components/RoundPager"
import {
  resumoDoLado,
  type GolCru,
} from "@/features/match/data/getMatchGoals"
import type { PartidaEncerrada } from "@/features/standings/data/getTournamentClassificacao"
import { cn } from "@/lib/utils"
import { mensagemResultado } from "@/lib/whatsapp"

// Timezone fixo do produto (app pt-BR): sem ele o servidor formataria em UTC
// e a data viraria "amanhã" à noite. Por-usuário só quando houver perfil.
const formatoData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Histórico de partidas encerradas — RSC puro, só renderiza o fetcher.
 * `mostrarReabrir` liga o console do dono (a autorização REAL fica no
 * servidor/RLS; o botão é só UX). Competitivo (partidas com rodada) é paginado
 * por rodada via passador, abrindo na ÚLTIMA (mais recente); avulso (sem
 * rodada) mantém a lista plana.
 */
export function MatchHistoryList({
  partidas,
  mostrarReabrir = false,
  userId,
  podeArbitrar = false,
  golsPorPartida,
  tournamentId,
  titulo,
}: {
  partidas: PartidaEncerrada[]
  mostrarReabrir?: boolean
  /** Usuário logado — resolve o lado do técnico para o editor "Meus artilheiros". */
  userId?: string
  /** Capacidade de arbitrar — habilita o editor COMPLETO (replace) dos dois lados. */
  podeArbitrar?: boolean
  /** Gols crus por partida (batelado) — alimenta detalhe, badge e preload do
   * editor. `null` = erro de IO (NÃO oferece as superfícies, para não mostrar
   * estado falso de "zero gols"); `undefined` = não competitivo. */
  golsPorPartida?: Map<string, GolCru[]> | null
  /** Torneio (change add-frente-compartilhavel): habilita "Compartilhar resultado"
   * por partida encerrada. Ausente ⇒ sem o botão (ex.: fixtures antigas). */
  tournamentId?: string
  /** Título do campeonato — texto do compartilhamento (`mensagemResultado`). */
  titulo?: string
}) {
  function renderItem(p: PartidaEncerrada) {
    // Artilharia colaborativa só em partida COMPETITIVA com placar (W.O. = 0×0 sem
    // gols; o trigger já limpou os match_goals). O lado do técnico logado resolve
    // por tecnico_1/2.id; o árbitro edita os dois lados.
    const gols = golsPorPartida?.get(p.id)
    const r1 = resumoDoLado(gols, 1)
    const r2 = resumoDoLado(gols, 2)
    const ladoDoTecnico: 1 | 2 | null =
      userId && p.tecnico_1?.id === userId
        ? 1
        : userId && p.tecnico_2?.id === userId
          ? 2
          : null
    const ehCompetitivo = p.tecnico_1 != null || p.tecnico_2 != null
    // `null` (erro de IO) e `undefined` (não competitivo) escondem as superfícies.
    const mostrarArtilheiros = !p.wo && ehCompetitivo && golsPorPartida != null

    // Badge "faltam N": o lado do técnico tem placar > soma atribuída.
    const faltamTecnico =
      ladoDoTecnico === 1
        ? p.placar_1 - r1.total
        : ladoDoTecnico === 2
          ? p.placar_2 - r2.total
          : 0

    const ladosArbitro: LadoEditavel[] = [
      { lado: 1, nomeLado: p.nome_1, placar: p.placar_1, existentes: r1.autores },
      { lado: 2, nomeLado: p.nome_2, placar: p.placar_2, existentes: r2.autores },
    ]
    const ladoTecnicoEdit: LadoEditavel[] =
      ladoDoTecnico === 1
        ? [{ lado: 1, nomeLado: p.nome_1, placar: p.placar_1, existentes: r1.autores }]
        : ladoDoTecnico === 2
          ? [{ lado: 2, nomeLado: p.nome_2, placar: p.placar_2, existentes: r2.autores }]
          : []

    return (
      <li
        key={p.id}
        className="flex items-center justify-between gap-4 rounded-lg border bg-card/40 px-4 py-3 text-sm motion-safe:transition-colors hover:border-primary/30"
      >
        {/* min-w-0 + truncate: sem eles, nome longo não encolhe (min-width
            auto do flex) e o grupo invade a data no mobile. */}
        <span className="flex min-w-0 items-center gap-2" aria-hidden="true">
          {/* Rodada/fase gerada; partida avulsa (rodada null) fica como
              sempre. Perna identifica ida/volta do confronto de mata-mata. */}
          {p.rodada !== null ? (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {p.grupo !== null ? `G${p.grupo} ` : ""}
              R{p.rodada}
              {p.perna !== null ? (p.perna === 1 ? " ida" : " volta") : ""}
            </span>
          ) : null}
          <span className={cn("truncate", p.wo && p.woVencedorLado === 1 && "font-semibold")}>
            {p.nome_1}
          </span>
          {p.wo ? (
            <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase">
              {p.woDuplo ? "W.O. duplo" : "W.O."}
            </span>
          ) : (
            <span className="shrink-0 font-display font-semibold tabular-nums">
              {p.placar_1} x {p.placar_2}
            </span>
          )}
          <span className={cn("truncate", p.wo && p.woVencedorLado === 2 && "font-semibold")}>
            {p.nome_2}
          </span>
        </span>
        <span className="sr-only">
          {p.wo
            ? `${p.rodada !== null ? `${p.grupo !== null ? `Grupo ${p.grupo}, ` : ""}Rodada ${p.rodada}: ` : ""}${p.woDuplo ? `W.O. duplo — ambos ausentes, sem vencedor (${p.nome_1} e ${p.nome_2})` : `W.O. — ${p.woVencedorLado === 1 ? p.nome_1 : p.nome_2} venceu`}`
            : `${p.rodada !== null ? `${p.grupo !== null ? `Grupo ${p.grupo}, ` : ""}Rodada ${p.rodada}${p.perna !== null ? ` (${p.perna === 1 ? "ida" : "volta"})` : ""}: ` : ""}Placar final: ${p.nome_1} ${p.placar_1}, ${p.nome_2} ${p.placar_2}`}
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {/* Detalhe (7.6): gol contra à parte, FORA do ranking de artilheiros. */}
          {!p.wo && (r1.contra > 0 || r2.contra > 0) ? (
            <span className="text-muted-foreground text-xs">
              {r1.contra > 0 ? `${p.nome_1}: ${r1.contra} contra` : ""}
              {r1.contra > 0 && r2.contra > 0 ? " • " : ""}
              {r2.contra > 0 ? `${p.nome_2}: ${r2.contra} contra` : ""}
            </span>
          ) : null}
          {/* Badge de descoberta (7.5): puxa o técnico ao editor "Meus artilheiros". */}
          {mostrarArtilheiros && ladoDoTecnico !== null && faltamTecnico > 0 ? (
            <span className="bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5 text-xs font-medium">
              faltam {faltamTecnico} artilheiro{faltamTecnico > 1 ? "s" : ""}
            </span>
          ) : null}
          {/* Editor do TÉCNICO (append) — só o próprio lado, existentes read-only. */}
          {mostrarArtilheiros && ladoDoTecnico !== null && !podeArbitrar ? (
            <ArtilheirosEncerrada
              matchId={p.id}
              modo="append"
              lados={ladoTecnicoEdit}
              triggerLabel="Meus artilheiros"
              triggerVariant="outline"
            />
          ) : null}
          {/* Editor do ORGANIZADOR (replace) — os DOIS lados, completo. */}
          {mostrarArtilheiros && podeArbitrar ? (
            <ArtilheirosEncerrada
              matchId={p.id}
              modo="replace"
              lados={ladosArbitro}
              triggerLabel="Artilheiros"
              triggerVariant="outline"
            />
          ) : null}
          <time dateTime={p.encerradaEm} className="text-muted-foreground text-xs">
            {formatoData.format(new Date(p.encerradaEm))}
          </time>
          {/* Compartilhar resultado (change add-frente-compartilhavel): qualquer
              logado que enxerga a partida. O texto é montado no servidor. */}
          {tournamentId ? (
            <CompartilharResultadoButton
              tournamentId={tournamentId}
              matchId={p.id}
              nome1={p.nome_1}
              nome2={p.nome_2}
              texto={mensagemResultado({
                titulo,
                nome1: p.nome_1,
                nome2: p.nome_2,
                placar1: p.placar_1,
                placar2: p.placar_2,
                wo: p.wo,
                woDuplo: p.woDuplo,
                woVencedorLado: p.woVencedorLado ?? null,
                tournamentId,
              })}
            />
          ) : null}
          {mostrarReabrir ? (
            <MatchStatusButton matchId={p.id} acao="reabrir" />
          ) : null}
        </span>
      </li>
    )
  }

  // Avulso (nenhuma rodada): lista plana, como antes.
  const temRodada = partidas.some((p) => p.rodada !== null)
  if (!temRodada) {
    return (
      <ul className="flex list-none flex-col gap-2 p-0">{partidas.map(renderItem)}</ul>
    )
  }

  // Competitivo: agrupa por rodada e mostra UMA por vez, abrindo na ÚLTIMA
  // rodada encerrada (a mais recente). Sem "Fechar rodada" (histórico).
  const porRodada = new Map<number, PartidaEncerrada[]>()
  for (const p of partidas) {
    const r = p.rodada ?? 0
    const lista = porRodada.get(r) ?? []
    lista.push(p)
    porRodada.set(r, lista)
  }
  const rodadas = [...porRodada.keys()].sort((a, b) => a - b)
  const rounds = rodadas.map((rodada) => ({
    rodada,
    content: (
      <ul className="flex list-none flex-col gap-2 p-0">
        {(porRodada.get(rodada) ?? []).map(renderItem)}
      </ul>
    ),
  }))

  return <RoundPager rounds={rounds} rodadaInicial={rodadas[rodadas.length - 1]} />
}
