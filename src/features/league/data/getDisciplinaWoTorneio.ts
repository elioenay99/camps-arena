import "server-only"

import { calcularStreakWo, type EventoWo } from "@/features/standings/woStreak"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Um técnico com W.O. seguidos numa competição (para o painel disciplinar). */
export interface TecnicoDisciplina {
  userId: string
  nome: string
  /** Foto real (`users.avatar`, URL pública) ou null → iniciais. */
  avatarUrl: string | null
  /** Slot da tenure ABERTA (para a ação Expulsar). */
  slotId: string
  /** W.O.-derrota seguidos correntes (streak, não acumulado). */
  streak: number
}

interface EventoRpc {
  user_id: string
  slot_id: string
  rodada: number | null
  tipo: string
  perdoado: boolean
}

/**
 * Painel disciplinar de W.O. seguidos por técnico numa competição (torneio).
 * Chama a RPC gated `sequencia_disciplina_torneio` (só quem `pode_gerir_torneio`
 * recebe linhas; a função levanta `NAO_AUTORIZADO` para os demais — aqui o erro
 * vira lista vazia, defensivo), agrupa por técnico, calcula o streak com o módulo
 * puro `calcularStreakWo` e resolve nome/avatar em `users`. Retorna SÓ os técnicos
 * com `streak > 0`, ordenados por streak desc (mais crítico primeiro).
 */
export async function getDisciplinaWoTorneio(
  supabase: ServerClient,
  { tournamentId }: { tournamentId: string }
): Promise<TecnicoDisciplina[]> {
  const { data, error } = await supabase.rpc("sequencia_disciplina_torneio", {
    p_tournament_id: tournamentId,
  })
  if (error || !data) return []

  const eventos = data as unknown as EventoRpc[]

  // Agrupa os eventos (já em ordem total da RPC) por técnico, preservando a ordem.
  const porTecnico = new Map<
    string,
    { slotId: string; eventos: EventoWo[] }
  >()
  for (const ev of eventos) {
    let g = porTecnico.get(ev.user_id)
    if (!g) {
      g = { slotId: ev.slot_id, eventos: [] }
      porTecnico.set(ev.user_id, g)
    }
    g.eventos.push({
      rodada: ev.rodada,
      tipo: ev.tipo === "wo_loss" || ev.tipo === "wo_win" ? ev.tipo : "jogou",
      perdoado: ev.perdoado,
    })
  }

  // Só técnicos com streak corrente > 0.
  const comStreak = [...porTecnico.entries()]
    .map(([userId, g]) => ({
      userId,
      slotId: g.slotId,
      streak: calcularStreakWo(g.eventos),
    }))
    .filter((t) => t.streak > 0)

  if (comStreak.length === 0) return []

  // Resolve nome/avatar num único hop (users é legível por qualquer logado).
  const { data: usuarios } = await supabase
    .from("users")
    .select("id, nome, avatar")
    .in(
      "id",
      comStreak.map((t) => t.userId)
    )
  const porId = new Map(
    (usuarios ?? []).map((u) => [u.id, u] as const)
  )

  return comStreak
    .map((t) => {
      const u = porId.get(t.userId)
      return {
        userId: t.userId,
        nome: u?.nome?.trim() || "Técnico",
        avatarUrl: u?.avatar ?? null,
        slotId: t.slotId,
        streak: t.streak,
      }
    })
    .sort((a, b) => b.streak - a.streak || a.nome.localeCompare(b.nome, "pt-BR"))
}
