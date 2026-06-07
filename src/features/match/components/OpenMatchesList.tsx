import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MatchStatusButton } from "@/features/match/components/MatchStatusButton"
import {
  FecharRodadaButton,
  MarcarWoButton,
  SolicitarWoButton,
} from "@/features/match/components/WoButtons"
import type { PartidaAberta } from "@/features/standings/data/getTournamentClassificacao"
import type { MatchStatus } from "@/lib/supabase/database.types"
import { linkWhatsApp, mensagemConvocacao } from "@/lib/whatsapp"

const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}

/**
 * Partidas em aberto do torneio — RSC puro. `mostrarEncerrar` liga o console
 * do DONO (encerrar + marcar W.O.); a autorização real é servidor/RLS, o botão
 * é só UX. `convocacao` habilita o atalho "Chamar {adversário}" E o "Solicitar
 * W.O." para quem JOGA a partida e não é o dono. Competitivo (partidas com
 * rodada) é AGRUPADO por rodada, com "Fechar rodada N" no cabeçalho da rodada
 * ATIVA (só dono); avulso mantém a lista plana.
 */
export function OpenMatchesList({
  partidas,
  mostrarEncerrar = false,
  convocacao,
  rodadaAtiva = null,
  tournamentId,
}: {
  partidas: PartidaAberta[]
  mostrarEncerrar?: boolean
  convocacao?: { userId: string; titulo: string; tournamentId: string }
  rodadaAtiva?: number | null
  tournamentId?: string
}) {
  const atalhoDe = (p: PartidaAberta) => {
    if (!convocacao) return null
    const adversario =
      p.participante_1?.id === convocacao.userId
        ? { lado: p.participante_2, nome: p.nome_2 }
        : p.participante_2?.id === convocacao.userId
          ? { lado: p.participante_1, nome: p.nome_1 }
          : null
    if (!adversario?.lado) return null
    const link = linkWhatsApp(
      adversario.lado.celular,
      mensagemConvocacao({
        adversario: adversario.nome,
        titulo: convocacao.titulo,
        tournamentId: convocacao.tournamentId,
      })
    )
    return link ? { link, nome: adversario.nome } : null
  }

  // O usuário JOGA a partida (é um dos lados) — habilita o "Solicitar W.O."
  // para quem não é dono.
  const jogaPartida = (p: PartidaAberta) =>
    convocacao != null &&
    (p.participante_1?.id === convocacao.userId ||
      p.participante_2?.id === convocacao.userId)

  function renderItem(p: PartidaAberta) {
    const atalho = atalhoDe(p)
    // W.O. (marcar ou solicitar) só faz sentido no COMPETITIVO (lados por
    // vaga) — no avulso vagaId é null e a action recusaria com mensagem
    // confusa ("você não joga"), então o botão nem aparece.
    const ehCompetitivo = p.vagaId_1 != null && p.vagaId_2 != null
    const podeMarcarWo = mostrarEncerrar && ehCompetitivo
    const podeSolicitarWo = !mostrarEncerrar && ehCompetitivo && jogaPartida(p)
    return (
      <li
        key={p.id}
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
      >
        <span className="flex min-w-0 items-center gap-2" aria-hidden="true">
          {p.rodada !== null ? (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {p.grupo !== null ? `G${p.grupo} ` : ""}
              R{p.rodada}
              {p.perna !== null ? (p.perna === 1 ? " ida" : " volta") : ""}
            </span>
          ) : null}
          <span className="truncate">{p.nome_1}</span>
          <span className="shrink-0 font-semibold tabular-nums">
            {p.placar_1} x {p.placar_2}
          </span>
          <span className="truncate">{p.nome_2}</span>
          {/* Clube órfão (sem técnico): viraria W.O. ao fechar a rodada. */}
          {p.orfao_1 || p.orfao_2 ? (
            <span className="text-muted-foreground shrink-0 text-xs">
              (vaga aberta)
            </span>
          ) : null}
        </span>
        <span className="sr-only">
          {`${p.rodada !== null ? `${p.grupo !== null ? `Grupo ${p.grupo}, ` : ""}Rodada ${p.rodada}${p.perna !== null ? ` (${p.perna === 1 ? "ida" : "volta"})` : ""}: ` : ""}Placar atual: ${p.nome_1} ${p.placar_1}, ${p.nome_2} ${p.placar_2} — partida ${LABEL_STATUS[p.status]}`}
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-3">
          <span aria-hidden="true" className="text-muted-foreground text-xs">
            {LABEL_STATUS[p.status]}
          </span>
          {atalho ? (
            <Button
              asChild
              size="sm"
              className="rounded-full bg-green-700 text-white hover:bg-green-800"
            >
              <a href={atalho.link} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" />
                Chamar
                <span className="sr-only">{` ${atalho.nome} no WhatsApp (abre em nova aba)`}</span>
              </a>
            </Button>
          ) : null}
          {podeSolicitarWo ? <SolicitarWoButton matchId={p.id} /> : null}
          {podeMarcarWo ? (
            <MarcarWoButton
              matchId={p.id}
              nome1={p.nome_1}
              nome2={p.nome_2}
              vagaId1={p.vagaId_1 as string}
              vagaId2={p.vagaId_2 as string}
            />
          ) : null}
          {mostrarEncerrar ? (
            <MatchStatusButton matchId={p.id} acao="encerrar" />
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

  // Competitivo: agrupa por rodada (a lista já vem ordenada por rodada→…).
  const porRodada = new Map<number, PartidaAberta[]>()
  for (const p of partidas) {
    const r = p.rodada ?? 0
    const lista = porRodada.get(r) ?? []
    lista.push(p)
    porRodada.set(r, lista)
  }
  const rodadas = [...porRodada.keys()].sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-5">
      {rodadas.map((rodada) => (
        <section key={rodada} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{`Rodada ${rodada}`}</h3>
            {mostrarEncerrar && tournamentId && rodada === rodadaAtiva ? (
              <FecharRodadaButton tournamentId={tournamentId} rodada={rodada} />
            ) : null}
          </div>
          <ul className="flex list-none flex-col gap-2 p-0">
            {(porRodada.get(rodada) ?? []).map(renderItem)}
          </ul>
        </section>
      ))}
    </div>
  )
}
