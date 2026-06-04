"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { createMatch, type CreateMatchFormState } from "@/actions/match"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { ParticipanteDisponivel } from "@/features/match/data/getParticipantesDisponiveis"
import type { TorneioProprio } from "@/features/tournament/data/getOwnTournaments"

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
  participantes: ParticipanteDisponivel[]
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
      >
        <option value="">Definir depois</option>
        {participantes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome ?? "Sem nome"}
          </option>
        ))}
      </select>
      {erro ? <p className="text-destructive text-sm">{erro}</p> : null}
    </div>
  )
}

export function MatchCreateForm({
  torneios,
  participantes,
}: {
  torneios: TorneioProprio[]
  participantes: ParticipanteDisponivel[]
}) {
  const [state, formAction] = useActionState(createMatch, initialState)

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="tournamentId">Torneio</Label>
        <select
          id="tournamentId"
          name="tournamentId"
          defaultValue={torneios.length === 1 ? torneios[0].id : ""}
          className={selectClassName}
          aria-invalid={Boolean(state.fieldErrors?.tournamentId)}
          required
        >
          <option value="" disabled>
            Selecione um torneio
          </option>
          {torneios.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titulo}
            </option>
          ))}
        </select>
        {state.fieldErrors?.tournamentId ? (
          <p className="text-destructive text-sm">
            {state.fieldErrors.tournamentId[0]}
          </p>
        ) : null}
      </div>

      <ParticipanteSelect
        campo="participante1"
        rotulo="Participante 1"
        participantes={participantes}
        erro={state.fieldErrors?.participante1?.[0]}
      />
      <ParticipanteSelect
        campo="participante2"
        rotulo="Participante 2"
        participantes={participantes}
        erro={state.fieldErrors?.participante2?.[0]}
      />

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
