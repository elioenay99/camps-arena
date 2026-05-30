"use client"

import { toast } from "sonner"

import { updateMatchScore, updateMatchTeams } from "@/actions/match"
import { selectTeam } from "@/actions/teams"
import {
  MatchScoreModal,
  type MatchScoreModalProps,
} from "@/features/match/components/MatchScoreModal"

export type MatchScoreModalConnectedProps = Omit<
  MatchScoreModalProps,
  "onSave" | "onSelecionarClube"
>

/**
 * Conecta o `MatchScoreModal` (apresentacional) à Server Action
 * `updateMatchScore`. Fica do lado cliente porque o closure `onSave` não
 * atravessa a fronteira RSC — um Server Component renderiza este wrapper
 * passando apenas props serializáveis (dados da partida).
 *
 * Converte o resultado da action no contrato do modal: rejeita a Promise
 * quando a action falha, para o modal manter o dialog aberto e exibir o
 * toast de erro.
 */
export function MatchScoreModalConnected(props: MatchScoreModalConnectedProps) {
  return (
    <MatchScoreModal
      {...props}
      onSave={async (input) => {
        const resultado = await updateMatchScore(input)
        if (!resultado.ok) {
          throw new Error(resultado.error)
        }
      }}
      onSelecionarClube={async (lado, team) => {
        // Cacheia o clube e associa ao lado escolhido da partida.
        const sel = await selectTeam(team)
        if (!sel.ok) {
          toast.error(sel.error)
          return
        }
        const patch = lado === 1 ? { time_1: sel.teamId } : { time_2: sel.teamId }
        const upd = await updateMatchTeams({ matchId: props.matchId, ...patch })
        if (!upd.ok) {
          toast.error(upd.error)
          return
        }
        toast.success("Clube atualizado.")
      }}
    />
  )
}
