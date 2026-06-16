"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { createMatch, type CreateMatchFormState } from "@/actions/match"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { ParticipanteDoTorneio } from "@/features/tournament/data/getParticipantesDoTorneio"

const initialState: CreateMatchFormState = {}

// Select nativo (projeto não usa shadcn Select — mesma decisão do checkbox
// nativo do form de torneio), estilizado com os tokens do design system.
const selectClassName =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Criando…" : "Criar partida"}
    </Button>
  )
}

function ParticipanteSelect({
  campo,
  rotulo,
  participantes,
  erro,
}: {
  campo: string
  rotulo: string
  participantes: ParticipanteDoTorneio[]
  erro?: string
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={campo}>{rotulo}</Label>
      <select
        id={campo}
        name={campo}
        defaultValue=""
        className={selectClassName}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${campo}-erro` : undefined}
      >
        <option value="">Definir depois</option>
        {participantes.map((p) => (
          <option key={p.id} value={p.id}>
            {/* trim||: nome "" ou whitespace também vira "Sem nome" (o
                trigger handle_new_user grava o metadata cru, sem trim). */}
            {p.nome?.trim() || "Sem nome"}
          </option>
        ))}
      </select>
      {erro ? (
        <p id={`${campo}-erro`} role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Form de nova partida de UM torneio (rota aninhada): o torneio vem fixo da
 * página (hidden) e os selects listam SÓ os participantes confirmados dele —
 * a escolha de torneio acontece antes, no seletor /dashboard/partidas/nova.
 */
export function MatchCreateForm({
  tournamentId,
  participantes,
}: {
  tournamentId: string
  participantes: ParticipanteDoTorneio[]
}) {
  const [state, formAction] = useActionState(createMatch, initialState)

  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <input type="hidden" name="tournamentId" value={tournamentId} />

      <ParticipanteSelect
        campo="participante1"
        rotulo="Participante 1"
        participantes={participantes}
        erro={state.fieldErrors?.participante1?.[0]}
      />

      {/* Divisor de confronto (decorativo): badge × ladeado por linhas — dá a
          cara de "P1 × P2" sem tocar o contrato dos selects. */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="bg-foreground/15 h-px flex-1" />
        <span className="bg-card text-muted-foreground font-display flex size-8 items-center justify-center rounded-full border text-sm font-bold">
          ×
        </span>
        <span className="bg-foreground/15 h-px flex-1" />
      </div>

      <ParticipanteSelect
        campo="participante2"
        rotulo="Participante 2"
        participantes={participantes}
        erro={state.fieldErrors?.participante2?.[0]}
      />

      {state.error || state.fieldErrors?.tournamentId ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error ?? state.fieldErrors?.tournamentId?.[0]}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
