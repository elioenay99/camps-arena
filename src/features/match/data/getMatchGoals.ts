import "server-only"

import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Um gol cru de uma partida (por lado), preservando `contra` e o nome (nullable). */
export interface GolCru {
  lado: 1 | 2
  jogador: string | null
  gols: number
  contra: boolean
}

/** Resumo dos gols de UM lado: normais (ranking) + contra (só placar) + total. */
export interface ResumoLado {
  /** Gols de artilheiros (normais) atribuídos ao lado. */
  normais: number
  /** Gols contra do lado. */
  contra: number
  /** Soma normais + contra (o que conta para o teto/placar do lado). */
  total: number
  /** As linhas cruas daquele lado (para exibição SOMENTE-LEITURA / detalhe). */
  autores: GolCru[]
}

/**
 * Leitor COMPARTILHADO dos gols crus por (partida, lado, contra) — a fonte única
 * de match_goals para as superfícies de exibição/descoberta da artilharia
 * colaborativa: o editor "Meus artilheiros" (linhas SOMENTE-LEITURA), o badge
 * "faltam N artilheiros" e o detalhe da partida ("N gols + M contra"). Batelado
 * (uma consulta para VÁRIAS partidas) — o badge precisa dos agregados de TODAS as
 * partidas encerradas listadas de uma vez, sem N+1. A RLS de match_goals filtra a
 * visibilidade (gols de rodada oculta não entram).
 *
 * Retorna `null` em ERRO DE IO — distinto de um `Map` vazio ("sem gols"): um erro
 * de leitura NÃO PODE degradar para "zero gols" (o editor/badge mostrariam um
 * estado falso, ex.: "faltam N" ou uma captura vazia sobre gols que existem). Os
 * consumidores tratam `null` como "desconhecido" e NÃO oferecem as superfícies.
 * Lista vazia de ids → `Map` vazio (não há o que consultar; não é erro).
 */
export async function getGolsCrusPorPartida(
  supabase: ServerClient,
  matchIds: string[]
): Promise<Map<string, GolCru[]> | null> {
  const porPartida = new Map<string, GolCru[]>()
  if (matchIds.length === 0) return porPartida

  const { data: goals, error } = await supabase
    .from("match_goals")
    .select("match_id, lado, jogador, gols, contra")
    .in("match_id", matchIds)
  if (error || !goals) return null

  for (const g of goals) {
    const lista = porPartida.get(g.match_id) ?? []
    lista.push({
      lado: (g.lado as 1 | 2),
      jogador: g.jogador,
      gols: g.gols,
      contra: g.contra,
    })
    porPartida.set(g.match_id, lista)
  }
  return porPartida
}

/**
 * Resume os gols de UM lado a partir das linhas cruas da partida: separa normais
 * (ranking) de contra (só placar) e soma o total (o que conta para o teto). Puro
 * (sem IO) — computa em memória sobre o resultado batelado.
 */
/**
 * Preload EDITÁVEL (superfícies REPLACE) — os autores já gravados de AMBOS os
 * lados, na forma `{lado, jogador, gols, contra}` que o `MatchScoreModal`
 * consome em `autoresIniciais`. Preserva `contra` e a grafia (anônimo → null).
 */
export function autoresIniciaisDaPartida(
  gols: GolCru[] | undefined
): { lado: 1 | 2; jogador: string | null; gols: number; contra: boolean }[] {
  return (gols ?? []).map((g) => ({
    lado: g.lado,
    jogador: g.jogador,
    gols: g.gols,
    contra: g.contra,
  }))
}

export function resumoDoLado(gols: GolCru[] | undefined, lado: 1 | 2): ResumoLado {
  const autores = (gols ?? []).filter((g) => g.lado === lado)
  const normais = autores
    .filter((g) => !g.contra)
    .reduce((acc, g) => acc + g.gols, 0)
  const contra = autores
    .filter((g) => g.contra)
    .reduce((acc, g) => acc + g.gols, 0)
  return { normais, contra, total: normais + contra, autores }
}
