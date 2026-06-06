"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import {
  participarDoProprioTorneio,
  removerParticipante,
  sairDoTorneio,
  type ParticipantActionResult,
} from "@/actions/participants"
import { Button } from "@/components/ui/button"

/**
 * Botões da gestão de participantes (folhas client mínimas, padrão
 * MatchStatusButton): action + toast; o revalidatePath das actions atualiza a
 * página — sem estado local além do pending.
 */
function ActionButton({
  rotulo,
  pendente,
  sucesso,
  variant = "outline",
  executar,
}: {
  rotulo: string
  pendente: string
  sucesso: string
  variant?: "default" | "outline" | "destructive"
  executar: () => Promise<ParticipantActionResult>
}) {
  const [emAndamento, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={emAndamento}
      onClick={() =>
        startTransition(async () => {
          const r = await executar()
          if (r.ok) toast.success(sucesso)
          else toast.error(r.error)
        })
      }
    >
      {emAndamento ? pendente : rotulo}
    </Button>
  )
}

/** Saída por conta própria — disponível a QUALQUER participante (dono incluso). */
export function LeaveTournamentButton({ tournamentId }: { tournamentId: string }) {
  return (
    <ActionButton
      rotulo="Sair do torneio"
      pendente="Saindo…"
      sucesso="Você saiu do torneio."
      executar={() => sairDoTorneio(tournamentId)}
    />
  )
}

/** Remoção pelo DONO. As partidas já criadas do removido ficam (histórico). */
export function RemoveParticipantButton({
  tournamentId,
  userId,
}: {
  tournamentId: string
  userId: string
}) {
  return (
    <ActionButton
      rotulo="Remover"
      pendente="Removendo…"
      sucesso="Participante removido."
      executar={() => removerParticipante({ tournamentId, userId })}
    />
  )
}

/** Reentrada do DONO (saiu e quer voltar / torneio anterior à entrada automática). */
export function JoinOwnTournamentButton({ tournamentId }: { tournamentId: string }) {
  return (
    <ActionButton
      rotulo="Participar"
      pendente="Entrando…"
      sucesso="Você entrou no torneio."
      variant="default"
      executar={() => participarDoProprioTorneio(tournamentId)}
    />
  )
}
