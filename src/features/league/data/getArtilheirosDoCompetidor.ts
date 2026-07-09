import "server-only"

import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Um artilheiro agregado por nome normalizado (case-insensitive). */
export interface ArtilheiroLinha {
  /** Grafia exibida (a menor por `localeCompare` do grupo — estável). */
  jogador: string
  gols: number
}

/**
 * Agrega linhas `{jogador, gols}` por nome normalizado (`lower(trim)`), somando
 * os gols. A grafia exibida é a MENOR do grupo por `localeCompare` (determinística
 * quando "Endrick"/"endrick" aparecem em partidas diferentes). Ordena por gols
 * decrescente, empate pelo nome.
 */
export function agregarPorNome(
  rows: Array<{ jogador: string; gols: number }>
): ArtilheiroLinha[] {
  const acc = new Map<string, { display: string; gols: number }>()
  for (const r of rows) {
    const nome = r.jogador.trim()
    if (nome === "") continue
    const key = nome.toLowerCase()
    const cur = acc.get(key)
    if (cur) {
      cur.gols += r.gols
      if (nome.localeCompare(cur.display) < 0) cur.display = nome
    } else {
      acc.set(key, { display: nome, gols: r.gols })
    }
  }
  return [...acc.values()]
    .map((v) => ({ jogador: v.display, gols: v.gols }))
    .sort((a, b) => b.gols - a.gols || a.jogador.localeCompare(b.jogador))
}

/**
 * Resolve os gols de UM competidor persistente da pirâmide, agregados por nome.
 * Percurso: `tournament_slots` do competidor → partidas em que uma das vagas é
 * dele → `match_goals` do LADO do competidor em cada partida. Compartilhado entre
 * a carreira (`getArtilheirosDoCompetidor`) e o autocomplete
 * (`getScorerSuggestions`). A RLS de `match_goals` filtra por visibilidade da
 * partida — gols de rodada oculta não entram para quem não pode vê-los.
 *
 * Retorna `[]` se o competidor não tem vaga/partida/gol ou em qualquer erro de IO
 * (a página degrada sem quebrar; a carreira é secundária).
 */
export async function golsPorNomeDoCompetidor(
  supabase: ServerClient,
  competitorId: string
): Promise<ArtilheiroLinha[]> {
  // Vagas concretas do competidor (uma por temporada/divisão que disputou).
  const { data: slots, error: slotsErr } = await supabase
    .from("tournament_slots")
    .select("id")
    .eq("competitor_id", competitorId)
  if (slotsErr || !slots || slots.length === 0) return []

  const slotIds = slots.map((s) => s.id)
  const slotSet = new Set(slotIds)

  // Partidas em que uma das vagas é do competidor. `.or` com in.() de uuids
  // (mesmo padrão de getActiveMatches). RLS de matches filtra a visibilidade.
  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select("id, vaga_1, vaga_2")
    .or(`vaga_1.in.(${slotIds.join(",")}),vaga_2.in.(${slotIds.join(",")})`)
  if (matchesErr || !matches || matches.length === 0) return []

  // Lado do competidor em cada partida (1 se a vaga_1 é dele; senão 2 — o `.or`
  // garante que ao menos um lado casa).
  const ladoPorMatch = new Map<string, 1 | 2>()
  for (const m of matches) {
    const lado: 1 | 2 = m.vaga_1 !== null && slotSet.has(m.vaga_1) ? 1 : 2
    ladoPorMatch.set(m.id, lado)
  }

  const matchIds = matches.map((m) => m.id)
  const { data: goals, error: goalsErr } = await supabase
    .from("match_goals")
    .select("match_id, lado, jogador, gols, contra")
    .in("match_id", matchIds)
  if (goalsErr || !goals) return []

  // Só os gols NORMAIS do LADO do competidor em cada partida (o adversário não
  // conta; o gol contra fica FORA da carreira e do autocomplete — ponto único de
  // filtro `contra = false` que carreira + `getScorerSuggestions` herdam). O
  // filtro de `contra` precede o `.trim()` — o gol contra pode ter `jogador` nulo.
  return agregarPorNome(
    goals
      .filter((g) => !g.contra && ladoPorMatch.get(g.match_id) === g.lado)
      .map((g) => ({ jogador: g.jogador ?? "", gols: g.gols }))
  )
}

/**
 * Artilheiros na carreira de um competidor persistente (seção da página do
 * competidor). Casa com a identidade usada por `getCompetitorProfile` (mesmo
 * `competitor_id`). Ordenado por gols decrescente.
 */
export async function getArtilheirosDoCompetidor(
  supabase: ServerClient,
  { competitorId }: { competitorId: string }
): Promise<ArtilheiroLinha[]> {
  return golsPorNomeDoCompetidor(supabase, competitorId)
}
