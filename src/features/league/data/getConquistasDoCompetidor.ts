import "server-only"

import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type ConquistaTipo =
  | "campeao"
  | "vice"
  | "artilheiro"
  | "melhor_ataque"
  | "melhor_defesa"
  | "melhor_sequencia"
  | "promovido"
  | "rebaixado"

/** Um troféu persistido na estante. `valor*`/`jogador` conforme o tipo. */
export interface Trofeu {
  tipo: ConquistaTipo
  nivel: number | null
  valorTexto: string | null
  valorNum: number | null
  jogador: string | null
}

/** Troféus de UMA temporada/competição, agrupados sob o rótulo estável. */
export interface ConquistaTemporada {
  refId: string
  rotulo: string
  conquistadoEm: string
  trofeus: Trofeu[]
}

/** Ordem de exibição dos troféus dentro de uma temporada (mais nobre primeiro). */
const ORDEM_TIPO: Record<ConquistaTipo, number> = {
  campeao: 0,
  vice: 1,
  promovido: 2,
  artilheiro: 3,
  melhor_ataque: 4,
  melhor_defesa: 5,
  melhor_sequencia: 6,
  rebaixado: 7,
}

/**
 * Estante (hall da fama) de um competidor persistente da pirâmide: os troféus
 * PERSISTIDOS em `conquistas`, agrupados por temporada/competição (rótulo estável
 * materializado no fechamento) e ordenados do mais recente ao mais antigo. A
 * identidade do competidor NÃO é denormalizada (lição da artilharia) — a página
 * já resolve nome/escudo; a RLS de `conquistas` é a barreira de visibilidade.
 *
 * Retorna `[]` se o competidor não tem troféus ou em qualquer erro de IO (a
 * estante é secundária; a página degrada sem quebrar).
 */
export async function getConquistasDoCompetidor(
  supabase: ServerClient,
  { competitorId }: { competitorId: string }
): Promise<ConquistaTemporada[]> {
  const { data, error } = await supabase
    .from("conquistas")
    .select("tipo, ref_id, ref_rotulo, nivel, valor_texto, valor_num, jogador, conquistado_em")
    .eq("competitor_id", competitorId)
    .order("conquistado_em", { ascending: false })
  if (error || !data) return []

  // Agrupa por ref_id preservando a ordem (mais recente primeiro pela query).
  const porTemporada = new Map<string, ConquistaTemporada>()
  for (const row of data) {
    let grupo = porTemporada.get(row.ref_id)
    if (!grupo) {
      grupo = {
        refId: row.ref_id,
        rotulo: row.ref_rotulo,
        conquistadoEm: row.conquistado_em,
        trofeus: [],
      }
      porTemporada.set(row.ref_id, grupo)
    }
    grupo.trofeus.push({
      tipo: row.tipo as ConquistaTipo,
      nivel: row.nivel,
      valorTexto: row.valor_texto,
      valorNum: row.valor_num,
      jogador: row.jogador,
    })
  }

  const grupos = [...porTemporada.values()]
  for (const g of grupos) {
    g.trofeus.sort(
      (a, b) => (ORDEM_TIPO[a.tipo] ?? 99) - (ORDEM_TIPO[b.tipo] ?? 99)
    )
  }
  return grupos
}
