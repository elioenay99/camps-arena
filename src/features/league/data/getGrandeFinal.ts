import "server-only"

import { resultadoDaChave } from "@/features/knockout/gerarChaveMataMata"
import {
  getTournamentClassificacao,
  type PartidaDaChave,
} from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"
import type { TournamentStatus } from "@/lib/supabase/database.types"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Estado da GRANDE FINAL de uma divisão de season split (Fase 5.1). Decorativa: só
 * coroa o campeão (5.1c), não entra no sobe/cai. Cinco estados:
 *  - `pendente`: as meias ainda não encerraram (nada a montar).
 *  - `campeao_direto`: as duas meias encerraram com o MESMO campeão (sem final).
 *  - `montar`: meias encerradas, campeões DISTINTOS, final ainda não montada.
 *  - `em_andamento`: final montada, ainda não decidida.
 *  - `decidida`: final montada e decidida — campeão definido.
 */
export interface GrandeFinalDivisao {
  divisionSeasonId: string
  estado: "pendente" | "campeao_direto" | "montar" | "em_andamento" | "decidida"
  finalTournamentId: string | null
  finalStatus: TournamentStatus | null
  /** Partidas da chave da final (vazio fora de montada) — insumo do BracketView. */
  partidas: PartidaDaChave[]
  /** Nome do campeão (presente em `campeao_direto` e `decidida`). */
  campeaoNome: string | null
  /** competitor_id do campeão (presente em `campeao_direto` e `decidida`). */
  campeaoCompetitorId: string | null
}

interface DivisaoCampea {
  divisionSeasonId: string
  tournamentId: string
  tournamentIdClausura: string
  finalTournamentId: string | null
}

/**
 * FONTE ÚNICA do CAMPEÃO de uma divisão split (5.1c) — usada por `getGrandeFinal`
 * (UI) e por `getCompetitorProfile` (título), para que as duas nunca divirjam.
 * Gate-agnóstico (o caller já checou posse/RLS). Devolve o competidor + nome do
 * campeão, ou `null` se ainda indefinido:
 *  - final montada e decidida ⇒ vencedor da chave (1 vaga = vencedor);
 *  - sem final ⇒ campeão DIRETO só quando os DOIS turnos têm o MESMO campeão.
 * Resolução DUAL: Apertura via `entries.slot_id`; Clausura via
 * `tournament_slots.competitor_id` (a entry aponta só para a Apertura).
 */
export async function resolverCampeaoDivisaoSplit(
  supabase: Supabase,
  div: DivisaoCampea
): Promise<{ competitorId: string; nome: string } | null> {
  // (A) Final montada: vencedor da chave (ida-e-volta de 2 = 1 vaga).
  if (div.finalTournamentId) {
    const finalClass = await getTournamentClassificacao(div.finalTournamentId)
    if (!finalClass) return null
    const partidas = finalClass.chave
    if (partidas.length === 0) return null
    const res = resultadoDaChave(
      partidas.map((p) => ({
        rodada: p.rodada,
        posicao: p.posicao,
        perna: p.perna,
        participante_1: p.participante_1,
        participante_2: p.participante_2,
        placar_1: p.placar_1,
        placar_2: p.placar_2,
        status: p.status,
        woVencedor: p.wo ? (p.woVencedor ?? null) : null,
      })),
      { modo: "playoff_acesso", estilo: "vagas", vagas: 1, playoffVagas: 2 }
    )
    if (!res.decidida || res.sobem.size !== 1) return null
    const campeaoSlot = [...res.sobem][0]
    let nome = "Sem nome"
    for (const p of partidas) {
      if (p.participante_1 === campeaoSlot) nome = p.nome_1
      else if (p.participante_2 === campeaoSlot) nome = p.nome_2
    }
    const { data: slots } = await supabase
      .from("tournament_slots")
      .select("id, competitor_id")
      .eq("tournament_id", div.finalTournamentId)
    const competitorId =
      (slots ?? []).find((s) => s.id === campeaoSlot)?.competitor_id ?? null
    if (!competitorId) return null
    return { competitorId, nome }
  }

  // (B) Sem final: campeão DIRETO (mesmo competidor nos dois turnos).
  const [apClass, clClass] = await Promise.all([
    getTournamentClassificacao(div.tournamentId),
    getTournamentClassificacao(div.tournamentIdClausura),
  ])
  if (!apClass || !clClass) return null
  if (
    apClass.torneio.status !== "encerrado" ||
    clClass.torneio.status !== "encerrado"
  ) {
    return null
  }
  const campeaoApLinha = apClass.linhas.find((l) => l.posicao === 1)
  const campeaoClLinha = clClass.linhas.find((l) => l.posicao === 1)
  if (!campeaoApLinha || !campeaoClLinha) return null

  const { data: entries } = await supabase
    .from("league_division_entries")
    .select("competitor_id, slot_id")
    .eq("division_season_id", div.divisionSeasonId)
  const compPorAperturaSlot = new Map<string, string>()
  for (const e of entries ?? []) {
    if (e.slot_id) compPorAperturaSlot.set(e.slot_id, e.competitor_id)
  }
  const { data: clSlots } = await supabase
    .from("tournament_slots")
    .select("id, competitor_id")
    .eq("tournament_id", div.tournamentIdClausura)
  const compPorClausuraSlot = new Map<string, string>()
  for (const s of clSlots ?? []) {
    if (s.competitor_id) compPorClausuraSlot.set(s.id, s.competitor_id)
  }

  const campeaoAp = compPorAperturaSlot.get(campeaoApLinha.participanteId)
  const campeaoCl = compPorClausuraSlot.get(campeaoClLinha.participanteId)
  if (!campeaoAp || !campeaoCl) return null
  // Campeões DISTINTOS ⇒ ainda sem campeão (depende da grande final).
  if (campeaoAp !== campeaoCl) return null
  return { competitorId: campeaoAp, nome: campeaoApLinha.nome }
}

interface DivisaoRow {
  id: string
  tournament_id: string | null
  tournament_id_clausura: string | null
  final_tournament_id: string | null
  league_seasons: { league_competitions: { id: string } | null } | null
}

/**
 * Carrega o estado da grande final de UMA divisão split. VISIBILIDADE pela RLS
 * (leitura serve qualquer logado; add-liga-visao-leitura). Retorna `null` se a
 * divisão não existe, é invisível ao usuário (RLS), ou NÃO é split (sem Clausura).
 * Reúso total do motor via `resolverCampeaoDivisaoSplit` (FONTE ÚNICA do campeão,
 * compartilhada com o título).
 *
 * O parâmetro `_userId` é mantido por compatibilidade com os call-sites; a
 * autorização NÃO o usa mais — deriva a capacidade da `competition_id` da season.
 */
export async function getGrandeFinal(
  divisionSeasonId: string,
  _userId?: string
): Promise<GrandeFinalDivisao | null> {
  void _userId
  const supabase = await createClient()

  const { data: divisao, error: divError } = await supabase
    .from("league_division_seasons")
    .select(
      "id, tournament_id, tournament_id_clausura, final_tournament_id, league_seasons!inner ( league_competitions!inner ( id ) )"
    )
    .eq("id", divisionSeasonId)
    .maybeSingle()
  if (divError) {
    throw new Error(`Falha ao carregar a grande final: ${divError.message}`)
  }
  const div = divisao as DivisaoRow | null
  if (!div || !div.tournament_id || !div.tournament_id_clausura) {
    return null // inexistente/invisível (RLS), ou divisão não-split
  }

  // Sem gate de capacidade no app-layer (add-liga-visao-leitura): a leitura serve
  // qualquer logado; a VISIBILIDADE é da RLS (a query acima já volta `null` quando
  // a divisão é invisível). O bracket é montado sobre as partidas que a RLS de
  // `matches` entrega (só rodadas liberadas ao não-dono).

  const base: GrandeFinalDivisao = {
    divisionSeasonId,
    estado: "pendente",
    finalTournamentId: div.final_tournament_id,
    finalStatus: null,
    partidas: [],
    campeaoNome: null,
    campeaoCompetitorId: null,
  }

  const campeao = await resolverCampeaoDivisaoSplit(supabase, {
    divisionSeasonId,
    tournamentId: div.tournament_id,
    tournamentIdClausura: div.tournament_id_clausura,
    finalTournamentId: div.final_tournament_id,
  })

  // (A) Final montada: lê a chave (BracketView) + decide estado pelo campeão.
  if (div.final_tournament_id) {
    const finalClass = await getTournamentClassificacao(div.final_tournament_id)
    const partidas = finalClass?.chave ?? []
    if (campeao) {
      return {
        ...base,
        estado: "decidida",
        finalStatus: finalClass?.torneio.status ?? null,
        partidas,
        campeaoNome: campeao.nome,
        campeaoCompetitorId: campeao.competitorId,
      }
    }
    return {
      ...base,
      estado: "em_andamento",
      finalStatus: finalClass?.torneio.status ?? null,
      partidas,
    }
  }

  // (B) Sem final: campeão direto, ou montar/pendente conforme as meias.
  if (campeao) {
    return {
      ...base,
      estado: "campeao_direto",
      campeaoNome: campeao.nome,
      campeaoCompetitorId: campeao.competitorId,
    }
  }
  const [apClass, clClass] = await Promise.all([
    getTournamentClassificacao(div.tournament_id),
    getTournamentClassificacao(div.tournament_id_clausura),
  ])
  const ambasEncerradas =
    apClass?.torneio.status === "encerrado" && clClass?.torneio.status === "encerrado"
  return { ...base, estado: ambasEncerradas ? "montar" : "pendente" }
}
