import { Clock, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MatchScoreModalConnected } from "@/features/match/components/MatchScoreModalConnected"
import type { ParticipantePartida } from "@/features/match/components/MatchScoreModal"
import { MatchStatusButton } from "@/features/match/components/MatchStatusButton"
import {
  MarcarWoButton,
  SolicitarWoButton,
} from "@/features/match/components/WoButtons"
import { RoundPager } from "@/features/match/components/RoundPager"
import {
  autoresIniciaisDaPartida,
  type GolCru,
} from "@/features/match/data/getMatchGoals"
import type {
  PartidaAberta,
  TecnicoDoLado,
} from "@/features/standings/data/getTournamentClassificacao"
import type { MatchStatus } from "@/lib/supabase/database.types"
import { linkWhatsApp, mensagemConvocacao } from "@/lib/whatsapp"

const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}

/**
 * Monta um lado da partida para o "Menu da Partida" (modo direto do
 * organizador) a partir de `PartidaAberta`. Deliberadamente SEM
 * `celular`/`mensagemWhatsApp`/`convocavel`: o editor do organizador não
 * convoca (o "Chamar" fica na linha) — assim nenhum telefone cruza a fronteira
 * RSC→client por este modal. O clube (escudo) só é montado quando existe
 * (competitivo); no avulso/por-nome cai no fallback de iniciais.
 */
function ladoModal(
  nome: string,
  escudo: string | null | undefined,
  tecnico: TecnicoDoLado | null | undefined,
  orfao: boolean | undefined
): ParticipantePartida {
  const detalhe = tecnico?.nome?.trim()
    ? `téc. ${tecnico.nome.trim()}`
    : orfao
      ? "vaga aberta"
      : undefined
  return {
    nome,
    detalhe,
    avatarUrl: escudo ?? null,
    clube: escudo ? { nome, escudoUrl: escudo } : null,
  }
}

/**
 * Partidas em aberto do torneio — RSC puro. `mostrarEncerrar` liga o console
 * do DONO (encerrar + marcar W.O.); a autorização real é servidor/RLS, o botão
 * é só UX. `convocacao` habilita o atalho "Chamar {adversário}" E o "Solicitar
 * W.O." para quem JOGA a partida e não é o dono. Competitivo (partidas com
 * rodada) é AGRUPADO por rodada, com "Fechar rodada N" no cabeçalho da rodada
 * ATIVA (só dono); avulso mantém a lista plana.
 *
 * `matchesComPropostaPendente`: partidas com uma PROPOSTA de placar pendente. O
 * console do organizador (Editar placar/Encerrar/W.O.) some nelas — gravar placar
 * direto por cima de uma proposta é inconsistente; o caminho é aprovar/rejeitar na
 * seção "Resultados pendentes". Gate de UX (autorização real é servidor/RLS); o Set
 * chega vazio a quem não arbitra, então nada muda fora da visão do organizador.
 */
export function OpenMatchesList({
  partidas,
  mostrarEncerrar = false,
  matchesComPropostaPendente = new Set<string>(),
  convocacao,
  rodadaAtiva = null,
  tournamentId,
  golsPorPartida,
}: {
  partidas: PartidaAberta[]
  mostrarEncerrar?: boolean
  matchesComPropostaPendente?: Set<string>
  convocacao?: { userId: string; titulo: string; tournamentId: string }
  rodadaAtiva?: number | null
  tournamentId?: string
  /** Gols crus por partida (batelado) — preload EDITÁVEL do modal direto do
   * organizador (partida REABERTA já tem match_goals). `null` = erro de IO
   * (não pré-carrega, para não abrir vazio sobre gols que podem existir). */
  golsPorPartida?: Map<string, GolCru[]> | null
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
  // para quem não é dono. No avulso o jogador é o participante; no competitivo
  // é o TÉCNICO da vaga.
  const jogaPartida = (p: PartidaAberta) =>
    convocacao != null &&
    (p.participante_1?.id === convocacao.userId ||
      p.participante_2?.id === convocacao.userId ||
      p.tecnico_1?.id === convocacao.userId ||
      p.tecnico_2?.id === convocacao.userId)

  function renderItem(p: PartidaAberta) {
    const atalho = atalhoDe(p)
    // Proposta de placar pendente: esconde o console do organizador (Editar
    // placar/Encerrar/W.O.) e mostra um indicador — o caminho é aprovar/rejeitar.
    const temPropostaPendente = matchesComPropostaPendente.has(p.id)
    // W.O. (marcar ou solicitar) só faz sentido no COMPETITIVO (lados por
    // vaga) — no avulso vagaId é null e a action recusaria com mensagem
    // confusa ("você não joga"), então o botão nem aparece.
    const ehCompetitivo = p.vagaId_1 != null && p.vagaId_2 != null
    const podeMarcarWo = mostrarEncerrar && ehCompetitivo && !temPropostaPendente
    const podeSolicitarWo = !mostrarEncerrar && ehCompetitivo && jogaPartida(p)
    return (
      <li
        key={p.id}
        className="flex flex-col items-stretch gap-3 rounded-lg border bg-card/40 px-4 py-3 text-sm motion-safe:transition-colors hover:border-primary/30 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
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
          <span className="shrink-0 font-display font-semibold tabular-nums">
            {p.placar_1} x {p.placar_2}
          </span>
          <span className="truncate">{p.nome_2}</span>
          {/* Clube órfão (sem técnico): viraria W.O. ao fechar a rodada. */}
          {p.orfao_1 || p.orfao_2 ? (
            <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
              (vaga aberta)
            </span>
          ) : null}
          {/* Pill de status: mora na linha de info (não no cluster de ações),
              para os botões empilharem limpos no mobile. */}
          <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-xs">
            {LABEL_STATUS[p.status]}
          </span>
        </span>
        <span className="sr-only">
          {`${p.rodada !== null ? `${p.grupo !== null ? `Grupo ${p.grupo}, ` : ""}Rodada ${p.rodada}${p.perna !== null ? ` (${p.perna === 1 ? "ida" : "volta"})` : ""}: ` : ""}Placar atual: ${p.nome_1} ${p.placar_1}, ${p.nome_2} ${p.placar_2} — partida ${LABEL_STATUS[p.status]}`}
        </span>
        {/* Cluster ÚNICO: empilha full-width no mobile, inline no desktop.
            O seletor de descendente atinge todo shadcn Button do cluster sem
            editar as folhas client; gap-x-6 (>=24px) só no desktop. */}
        <span className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3 [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
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
              permiteDuplo={p.posicao == null}
            />
          ) : null}
          {/* Editor de placar do ORGANIZADOR (modo direto → updateMatchScore).
              Mesmo gate de "Encerrar" (mostrarEncerrar = podeArbitrarPartidas);
              autorização real é servidor/RLS. placarInicial é OBRIGATÓRIO aqui:
              omiti-lo (default 0) abriria um 2×1 mostrando 0×0 e sobrescreveria
              ao salvar. Sem busca de clube e sem lado convocável (sem PII). */}
          {/* Proposta pendente: no lugar do console do organizador (Editar
              placar/Encerrar/W.O.), um indicador discreto apontando ao fluxo de
              aprovação. Só a quem arbitra (mostrarEncerrar) — para os demais o
              console nunca existiu. */}
          {mostrarEncerrar && temPropostaPendente ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <Clock className="size-3.5" aria-hidden="true" />
              Aguardando aprovação — veja Resultados pendentes
            </span>
          ) : null}
          {mostrarEncerrar && !temPropostaPendente ? (
            <MatchScoreModalConnected
              matchId={p.id}
              tituloPartida={`${p.nome_1} x ${p.nome_2}`}
              subtitulo={
                p.rodada !== null
                  ? `${p.grupo !== null ? `G${p.grupo} ` : ""}R${p.rodada}${
                      p.perna !== null ? (p.perna === 1 ? " ida" : " volta") : ""
                    } • ${LABEL_STATUS[p.status]}`
                  : LABEL_STATUS[p.status]
              }
              descricao={`${p.nome_1} enfrenta ${p.nome_2}`}
              participante1={ladoModal(p.nome_1, p.escudo_1, p.tecnico_1, p.orfao_1)}
              participante2={ladoModal(p.nome_2, p.escudo_2, p.tecnico_2, p.orfao_2)}
              placarInicial1={p.placar_1}
              placarInicial2={p.placar_2}
              // Vagas (competitivo) → habilitam a captura de autores + autocomplete.
              vagaId1={p.vagaId_1 ?? null}
              vagaId2={p.vagaId_2 ?? null}
              // Preload EDITÁVEL: os autores JÁ gravados (partida reaberta) — a
              // captura nunca abre vazia sobre gols existentes. Como o modal é
              // REPLACE, esvaziar um lado no editor passa a APAGAR (intencional).
              autoresIniciais={autoresIniciaisDaPartida(golsPorPartida?.get(p.id))}
              permitirEscolherClube={false}
              modoPlacar="direto"
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-11 px-4"
                  aria-label={`Editar placar de ${p.nome_1} contra ${p.nome_2}`}
                >
                  Editar placar
                </Button>
              }
            />
          ) : null}
          {mostrarEncerrar && !temPropostaPendente ? (
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

  // Competitivo: agrupa por rodada (a lista já vem ordenada por rodada→…) e
  // entrega UMA rodada por vez ao passador, que abre na rodada ATIVA e carrega o
  // "Fechar rodada". Os itens (com o wa.me/PII) são renderizados AQUI, no
  // servidor — o passador (client) só alterna qual rodada aparece.
  const porRodada = new Map<number, PartidaAberta[]>()
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

  return (
    <RoundPager
      rounds={rounds}
      rodadaInicial={rodadaAtiva}
      rodadaAtiva={rodadaAtiva}
      tournamentId={tournamentId}
      podeFechar={mostrarEncerrar}
    />
  )
}
