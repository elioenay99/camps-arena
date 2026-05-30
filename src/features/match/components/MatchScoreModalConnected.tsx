"use client"

import { updateMatchScore } from "@/actions/match"
import {
  MatchScoreModal,
  type MatchScoreModalProps,
} from "@/features/match/components/MatchScoreModal"

export type MatchScoreModalConnectedProps = Omit<MatchScoreModalProps, "onSave">

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
    />
  )
}
