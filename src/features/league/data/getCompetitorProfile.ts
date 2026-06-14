import "server-only"

import { createClient } from "@/lib/supabase/server"
import { calcularPromedio } from "@/features/league/flowEngine"

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
 * precisa estar ATIVA (`status='ativa'`) OU o leitor ser o dono — ESPELHA a RLS
 * das tabelas `league_*` (a estrutura é pública enquanto ativa; só placares de
 * PARTIDA herdam o sigilo via `tournaments.is_public`). Esta página expõe SÓ
 * agregados das entries (pontos/jogos/posição/destino), nunca placares de jogo.
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
      `id, rotulo, team_id,
       team:teams ( nome, escudo_url ),
       competition:league_competitions!inner ( id, nome, status, created_by )`
    )
    .eq("id", competitorId)
    .maybeSingle()
  if (compError || !comp) return null

  const competition = comp.competition as unknown as {
    id: string
    nome: string
    status: string
    created_by: string | null
  } | null
  if (!competition) return null
  const ehDono = !!user && user.id === competition.created_by
  if (competition.status !== "ativa" && !ehDono) return null

  const team = comp.team as unknown as { nome: string | null; escudo_url: string | null } | null
  const porNome = comp.rotulo != null
  const nome = porNome ? (comp.rotulo as string) : (team?.nome ?? "Competidor")
  const escudoUrl = porNome ? null : (team?.escudo_url ?? null)

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
  const { data: entries, error: entriesError } = await supabase
    .from("league_division_entries")
    .select(
      `posicao_final, destino, pontos, jogos,
       division:league_division_seasons!inner (
         nivel, nome,
         season:league_seasons!inner ( numero )
       )`
    )
    .eq("competitor_id", competitorId)
    .not("posicao_final", "is", null)
  if (entriesError) return null

  const historico: TemporadaHistorico[] = []
  for (const e of entries ?? []) {
    const division = e.division as unknown as {
      nivel: number
      nome: string
      season: { numero: number } | null
    } | null
    if (!division || !division.season) continue
    const pontos = e.pontos ?? 0
    const jogos = e.jogos ?? 0
    historico.push({
      numero: division.season.numero,
      nivel: division.nivel,
      divisaoNome: division.nome,
      posicaoFinal: e.posicao_final as number,
      destino: (e.destino as TemporadaHistorico["destino"]) ?? null,
      pontos,
      jogos,
      ppg: jogos > 0 ? pontos / jogos : 0,
    })
  }
  historico.sort((a, b) => a.numero - b.numero)

  const totalPontos = historico.reduce((s, t) => s + t.pontos, 0)
  const totalJogos = historico.reduce((s, t) => s + t.jogos, 0)
  const titulos = historico.filter((t) => t.posicaoFinal === 1).length
  const titulosElite = historico.filter((t) => t.nivel === 1 && t.posicaoFinal === 1).length
  const acessos = historico.filter((t) => t.destino === "sobe").length
  const quedas = historico.filter((t) => t.destino === "cai").length

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
