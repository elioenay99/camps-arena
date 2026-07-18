"use client"

import { createContext, useContext, useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import type { MatchStatus } from "@/lib/supabase/database.types"

/** Estado "vivo" de uma partida — só o que o Realtime atualiza no painel. */
export interface LiveMatchState {
  placar_1: number
  placar_2: number
  status: MatchStatus
}

export type LiveMatchSeed = { id: string } & LiveMatchState

type LiveMap = Record<string, LiveMatchState>

const LiveMatchesContext = createContext<LiveMap>({})

/** Lê o estado vivo de uma partida. `undefined` quando fora de um provider
 * (as folhas caem no valor inicial vindo da RSC). */
export function useLiveMatch(id: string): LiveMatchState | undefined {
  return useContext(LiveMatchesContext)[id]
}

function semear(seeds: LiveMatchSeed[]): LiveMap {
  return Object.fromEntries(
    seeds.map((m) => [
      m.id,
      { placar_1: m.placar_1, placar_2: m.placar_2, status: m.status },
    ])
  )
}

/**
 * Assina UM canal Supabase Realtime (`postgres_changes` UPDATE de `matches`)
 * para a página inteira e distribui o placar/status por `matchId` via context.
 * O canal é autenticado (sessão por cookie), então o Realtime só entrega
 * eventos de partidas que o usuário já pode ler (RLS reusada).
 *
 * Só atualiza partidas JÁ presentes na tela (decisão de produto): eventos de
 * ids ausentes do mapa são ignorados. A composição da lista (entrar/sair) só
 * muda num novo carregamento — o `initial` reseme o estado a cada render da RSC.
 *
 * `tournamentId` OPCIONAL: numa página de torneio único, escopa a assinatura por
 * `tournament_id=eq.<id>` (o Postgres já filtra na origem, em vez de o cliente
 * descartar eventos de outros torneios). O dashboard multi-torneio NÃO passa nada
 * e mantém o filtro client-side deliberado (assina todos os `matches` visíveis por
 * RLS). O nome do canal também é escopado, para dois providers (páginas distintas)
 * nunca colidirem no mesmo canal.
 */
export function LiveMatchesProvider({
  initial,
  tournamentId,
  children,
}: {
  initial: LiveMatchSeed[]
  tournamentId?: string
  children: React.ReactNode
}) {
  const [live, setLive] = useState<LiveMap>(() => semear(initial))

  // Recarregamento da RSC (refresh/navegação) traz dados frescos e
  // autoritativos: reseme o estado quando o `initial` mudar de referência (só
  // muda quando a RSC re-renderiza — re-renders client de Realtime mantêm a
  // mesma prop). Padrão "ajustar estado ao mudar de prop" (durante o render).
  const [seedAnterior, setSeedAnterior] = useState(initial)
  if (initial !== seedAnterior) {
    setSeedAnterior(initial)
    setLive(semear(initial))
  }

  useEffect(() => {
    const supabase = createClient()
    // Escopo por torneio (quando informado): o Postgres filtra na origem; o nome
    // do canal acompanha o escopo para providers de páginas distintas não
    // colidirem. Sem `tournamentId`, o comportamento é idêntico ao do dashboard.
    const canal = tournamentId ? `matches-torneio-${tournamentId}` : "dashboard-matches"
    const filtro: { event: "UPDATE"; schema: "public"; table: "matches"; filter?: string } =
      { event: "UPDATE", schema: "public", table: "matches" }
    if (tournamentId) filtro.filter = `tournament_id=eq.${tournamentId}`
    const channel = supabase
      .channel(canal)
      .on(
        "postgres_changes",
        filtro,
        (payload) => {
          const row = payload.new as {
            id: string
            placar_1: number
            placar_2: number
            status: MatchStatus
          }
          // Só atualiza partidas JÁ na tela: o estado atual (semeado/resemeado
          // pelo `initial`) é a fonte dos ids visíveis — id ausente é ignorado.
          setLive((prev) =>
            prev[row.id]
              ? {
                  ...prev,
                  [row.id]: {
                    placar_1: row.placar_1,
                    placar_2: row.placar_2,
                    status: row.status,
                  },
                }
              : prev
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tournamentId])

  return (
    <LiveMatchesContext.Provider value={live}>
      {children}
    </LiveMatchesContext.Provider>
  )
}
