import "server-only"

import { golsPorNomeDoCompetidor } from "@/features/league/data/getArtilheirosDoCompetidor"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Nomes que AQUELE competidor já usou como autor de gol, para o autocomplete do
 * modal de placar. Ordenado por prominência (total de gols decrescente — proxy
 * de frequência): os artilheiros mais recorrentes do competidor aparecem
 * primeiro. Escopado ao competidor (decisão travada: autocomplete não mistura
 * competidores). Avulso (sem competidor persistente) fica para depois — este
 * autocomplete é do fluxo competitivo/pirâmide.
 */
export async function getScorerSuggestions(
  supabase: ServerClient,
  { competitorId }: { competitorId: string }
): Promise<string[]> {
  const linhas = await golsPorNomeDoCompetidor(supabase, competitorId)
  return linhas.map((l) => l.jogador)
}
