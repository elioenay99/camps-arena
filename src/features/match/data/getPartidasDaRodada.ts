import "server-only"

import type { createClient } from "@/lib/supabase/server"

/** Um lado do confronto na imagem da rodada. */
export interface LadoRodada {
  nome: string
  /** Escudo do clube (competitivo); null em por-nome (usa monograma). */
  escudoUrl: string | null
  porNome: boolean
}

export interface ConfrontoRodada {
  lado1: LadoRodada
  lado2: LadoRodada
  /** Mata-mata ida-e-volta: as 2 pernas viram 1 confronto na imagem. */
  idaEVolta: boolean
}

interface VagaEmbed {
  rotulo: string | null
  team: { nome: string | null; escudo_url: string | null } | null
}

interface MatchRow {
  id: string
  posicao: number | null
  perna: number | null
  created_at: string
  v1: VagaEmbed | null
  v2: VagaEmbed | null
}

/** Lado a partir da vaga: clube (escudo) ?? rótulo (por-nome). `null` quando a
 * vaga não tem identidade (bye/TBD) — o confronto inteiro é descartado. */
function ladoDaVaga(v: VagaEmbed | null): LadoRodada | null {
  if (!v) return null
  const clube = v.team?.nome?.trim()
  if (clube) return { nome: clube, escudoUrl: v.team?.escudo_url ?? null, porNome: false }
  const rot = v.rotulo?.trim()
  if (rot) return { nome: rot, escudoUrl: null, porNome: true }
  return null
}

/**
 * Confrontos de UMA rodada para a IMAGEM (change add-compartilhar-rodada).
 * Fetcher enxuto: lê só `matches` da rodada (a RLS entrega tudo ao dono),
 * resolve cada lado por VAGA e expõe `porNome` (monograma). Mais barato que
 * `getTournamentClassificacao` (que puxa o torneio inteiro + computeStandings).
 *
 * - **Bye/TBD**: confrontos com algum lado sem identidade (vaga nula) são
 *   PULADOS (não viram "A definir"/monograma enganoso).
 * - **Ida-e-volta** (mata-mata): as 2 pernas compartilham `rodada` (só muda
 *   `perna`) → deduplicadas por `posicao` (uma linha, `idaEVolta=true`). Na liga
 *   ida/volta caem em rodadas diferentes (numeração contínua) — sem dedup.
 */
export async function getPartidasDaRodada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  rodada: number
): Promise<ConfrontoRodada[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, posicao, perna, created_at,
       v1:tournament_slots!matches_vaga_1_fkey ( rotulo, team:teams!tournament_slots_team_id_fkey ( nome, escudo_url ) ),
       v2:tournament_slots!matches_vaga_2_fkey ( rotulo, team:teams!tournament_slots_team_id_fkey ( nome, escudo_url ) )`
    )
    .eq("tournament_id", tournamentId)
    .eq("rodada", rodada)

  if (error) throw new Error(`Falha ao carregar a rodada: ${error.message}`)

  const linhas = (data ?? []) as unknown as MatchRow[]
  // Ordem de disputa estável (slot/perna/criação).
  linhas.sort(
    (a, b) =>
      (a.posicao ?? 0) - (b.posicao ?? 0) ||
      (a.perna ?? 0) - (b.perna ?? 0) ||
      (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
  )

  const slotsVistos = new Set<number>()
  const confrontos: ConfrontoRodada[] = []
  for (const m of linhas) {
    const lado1 = ladoDaVaga(m.v1)
    const lado2 = ladoDaVaga(m.v2)
    if (!lado1 || !lado2) continue // bye/TBD
    const idaEVolta = m.perna != null
    if (idaEVolta && m.posicao != null) {
      if (slotsVistos.has(m.posicao)) continue // 2ª perna do mesmo par
      slotsVistos.add(m.posicao)
    }
    confrontos.push({ lado1, lado2, idaEVolta })
  }
  return confrontos
}
