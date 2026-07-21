import "server-only"

import { createClient } from "@/lib/supabase/server"
import { podeVerBastidores } from "@/lib/autorizacao"
import { escudoEfetivo } from "@/lib/escudoEfetivo"
import { calcularPromedio } from "@/features/league/flowEngine"
import { resolverCampeaoDivisaoSplit } from "@/features/league/data/getGrandeFinal"

/** Uma temporada na linha do tempo do competidor (já consolidada). */
export interface TemporadaHistorico {
  /** Número da temporada na pirâmide (1-based). */
  numero: number
  /** Nível da divisão disputada (1 = elite). */
  nivel: number
  divisaoNome: string
  posicaoFinal: number
  destino: "sobe" | "cai" | "permanece" | null
  pontos: number
  jogos: number
  /** Pontos por jogo da temporada (0 se jogos = 0). */
  ppg: number
  /**
   * true = campeão DA DIVISÃO nessa temporada. Em divisão de season split, é o
   * vencedor da grande final (ou campeão direto), NÃO o líder da combinada; em
   * divisão anual, equivale a `posicaoFinal === 1`.
   */
  campeao: boolean
}

/** Perfil completo de um competidor persistente (página da Fase 4). */
export interface CompetidorPerfil {
  id: string
  /** Rótulo (modo nome) ou nome do clube (modo clube). */
  nome: string
  escudoUrl: string | null
  /** true = competidor por NOME (rótulo); false = por CLUBE. */
  porNome: boolean
  competitionId: string
  competitionNome: string
  /**
   * Id da TEMPORADA corrente (maior `numero`) — alvo do link "voltar à pirâmide"
   * (a rota `/dashboard/ligas/[id]` resolve um `league_seasons.id`, NÃO o
   * competition id). `null` se a pirâmide não tem temporada.
   */
  seasonAtualId: string | null
  /** Linha do tempo (temporadas consolidadas, mais recente por último). */
  historico: TemporadaHistorico[]
  // Agregados de vida toda.
  temporadasDisputadas: number
  totalPontos: number
  totalJogos: number
  promedio: number
  /** Vezes que terminou em 1º em alguma divisão. */
  titulos: number
  /** Vezes campeão da ELITE (nível 1, posição 1). */
  titulosElite: number
  acessos: number
  quedas: number
}

/**
 * Perfil de um competidor persistente da pirâmide. Gate de leitura: a pirâmide
 * precisa estar ATIVA (`status='ativa'`) OU o leitor ter capacidade de ver
 * bastidores (`podeVerBastidores` = dono OU qualquer membro/papel da liga — a
 * herança de admin/árbitro/moderador passa a funcionar). ESPELHA a RLS das
 * tabelas `league_*` (a estrutura é pública enquanto ativa; só placares de PARTIDA
 * herdam o sigilo via `tournaments.is_public`). Esta página expõe SÓ agregados das
 * entries (pontos/jogos/posição/destino), nunca placares de jogo.
 *
 * Retorna `null` se o competidor não existe ou a leitura é negada (RLS/gate).
 */
export async function getCompetitorProfile(
  competitorId: string
): Promise<CompetidorPerfil | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Competidor + identidade (clube/rótulo) + competição (gate). A RLS já restringe
  // a leitura a pirâmides ativas/do dono; o filtro aqui é a defesa em UX.
  const { data: comp, error: compError } = await supabase
    .from("league_competitors")
    .select(
      `id, rotulo, team_id, escudo_url,
       team:teams ( nome, escudo_url ),
       competition:league_competitions!inner ( id, nome, status )`
    )
    .eq("id", competitorId)
    .maybeSingle()
  if (compError || !comp) return null

  const competition = comp.competition as unknown as {
    id: string
    nome: string
    status: string
  } | null
  if (!competition) return null
  // Gate de leitura: pirâmide ATIVA (público) OU capacidade de ver bastidores
  // (dono OU qualquer membro/papel — herança de admin/árbitro/moderador). Sem
  // sessão e fora de 'ativa' → negado (podeVerBastidores resolve auth.uid()=null).
  if (
    competition.status !== "ativa" &&
    !(user && (await podeVerBastidores(supabase, { competitionId: competition.id })))
  ) {
    return null
  }

  const team = comp.team as unknown as { nome: string | null; escudo_url: string | null } | null
  const porNome = comp.rotulo != null
  const nome = porNome ? (comp.rotulo as string) : (team?.nome ?? "Competidor")
  // Competidor por NOME pode ter escudo próprio da liga (escudo-personalizado-liga):
  // o override entra ANTES do ternário do catálogo.
  const escudoUrl = escudoEfetivo(comp.escudo_url, porNome ? null : team?.escudo_url)

  // Temporada corrente (maior numero) — alvo do back-link (a rota resolve um
  // league_seasons.id, não o competition.id). Sob a mesma RLS (status/dono).
  const { data: seasonAtual } = await supabase
    .from("league_seasons")
    .select("id")
    .eq("competition_id", competition.id)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle()
  const seasonAtualId = seasonAtual?.id ?? null

  // Entries consolidadas (posicao_final preenchida = temporada encerrada) com a
  // geometria (nível/nome da divisão) e o número da temporada.
  // Fase 5.1: + ciclo da season e os torneios da divisão (resolução do campeão de
  // season split). NÃO embeda `tournaments` (3 FKs ⇒ ambíguo) — o resolver lê os
  // torneios por id em queries próprias.
  const { data: entries, error: entriesError } = await supabase
    .from("league_division_entries")
    .select(
      `posicao_final, destino, pontos, jogos,
       division:league_division_seasons!inner (
         id, nivel, nome, tournament_id, tournament_id_clausura, final_tournament_id,
         season:league_seasons!inner ( numero, ciclo )
       )`
    )
    .eq("competitor_id", competitorId)
    .not("posicao_final", "is", null)
  if (entriesError) return null

  interface EntradaConsolidada {
    posicaoFinal: number
    destino: TemporadaHistorico["destino"]
    pontos: number
    jogos: number
    numero: number
    nivel: number
    divisaoNome: string
    divisionSeasonId: string
    ciclo: string
    tournamentId: string | null
    tournamentIdClausura: string | null
    finalTournamentId: string | null
  }

  const entradas: EntradaConsolidada[] = []
  for (const e of entries ?? []) {
    const division = e.division as unknown as {
      id: string
      nivel: number
      nome: string
      tournament_id: string | null
      tournament_id_clausura: string | null
      final_tournament_id: string | null
      season: { numero: number; ciclo: string } | null
    } | null
    if (!division || !division.season) continue
    entradas.push({
      posicaoFinal: e.posicao_final as number,
      destino: (e.destino as TemporadaHistorico["destino"]) ?? null,
      pontos: e.pontos ?? 0,
      jogos: e.jogos ?? 0,
      numero: division.season.numero,
      nivel: division.nivel,
      divisaoNome: division.nome,
      divisionSeasonId: division.id,
      ciclo: division.season.ciclo,
      tournamentId: division.tournament_id,
      tournamentIdClausura: division.tournament_id_clausura,
      finalTournamentId: division.final_tournament_id,
    })
  }

  // CAMPEÃO por entrada (5.1c): em divisão de season split, o título é do VENCEDOR
  // da grande final (ou campeão direto), NUNCA `posicao_final===1` (líder da
  // combinada). Em divisão anual, o legado: posicao_final===1.
  const ehCampeaoPorEntrada = await Promise.all(
    entradas.map(async (en) => {
      const ehSplit =
        en.ciclo === "apertura_clausura" &&
        en.tournamentId != null &&
        en.tournamentIdClausura != null
      if (!ehSplit) return en.posicaoFinal === 1
      const campeao = await resolverCampeaoDivisaoSplit(supabase, {
        divisionSeasonId: en.divisionSeasonId,
        tournamentId: en.tournamentId as string,
        tournamentIdClausura: en.tournamentIdClausura as string,
        finalTournamentId: en.finalTournamentId,
      })
      return campeao?.competitorId === competitorId
    })
  )

  const historico: TemporadaHistorico[] = entradas
    .map((en, i) => ({
      numero: en.numero,
      nivel: en.nivel,
      divisaoNome: en.divisaoNome,
      posicaoFinal: en.posicaoFinal,
      destino: en.destino,
      pontos: en.pontos,
      jogos: en.jogos,
      ppg: en.jogos > 0 ? en.pontos / en.jogos : 0,
      campeao: ehCampeaoPorEntrada[i],
    }))
    .sort((a, b) => a.numero - b.numero)

  const totalPontos = entradas.reduce((s, t) => s + t.pontos, 0)
  const totalJogos = entradas.reduce((s, t) => s + t.jogos, 0)
  const titulos = ehCampeaoPorEntrada.filter(Boolean).length
  const titulosElite = entradas.filter(
    (en, i) => en.nivel === 1 && ehCampeaoPorEntrada[i]
  ).length
  const acessos = entradas.filter((t) => t.destino === "sobe").length
  const quedas = entradas.filter((t) => t.destino === "cai").length

  return {
    id: comp.id,
    nome,
    escudoUrl,
    porNome,
    competitionId: competition.id,
    competitionNome: competition.nome,
    seasonAtualId,
    historico,
    temporadasDisputadas: historico.length,
    totalPontos,
    totalJogos,
    promedio: calcularPromedio({
      historicoPontos: totalPontos,
      historicoJogos: totalJogos,
      atualPontos: 0,
      atualJogos: 0,
    }),
    titulos,
    titulosElite,
    acessos,
    quedas,
  }
}
