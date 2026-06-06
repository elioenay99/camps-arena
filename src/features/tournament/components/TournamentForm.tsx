"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { createTournament, type TournamentFormState } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PONTOS_MAX, PONTUACAO_PADRAO } from "@/schema/tournamentSchema"

const initialState: TournamentFormState = {}

function PontosInput({
  campo,
  rotulo,
  padrao,
  erro,
}: {
  campo: string
  rotulo: string
  padrao: number
  erro?: string
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={campo}>{rotulo}</Label>
      <Input
        id={campo}
        name={campo}
        type="number"
        inputMode="numeric"
        min={0}
        max={PONTOS_MAX}
        step={1}
        defaultValue={padrao}
        aria-invalid={Boolean(erro)}
      />
      {erro ? <p className="text-destructive text-sm">{erro}</p> : null}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Criando…" : "Criar torneio"}
    </Button>
  )
}

export function TournamentForm() {
  const [state, formAction] = useActionState(createTournament, initialState)
  // Estado local SÓ para progressive disclosure (ida-e-volta em liga e
  // mata-mata; 3º lugar só em mata-mata); o valor submetido é o do radio
  // nativo — sem ele o form continua funcional.
  const [formato, setFormato] = useState<"avulso" | "liga" | "mata_mata">("avulso")

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          autoComplete="off"
          placeholder="Ex.: Copa da Firma 2026"
          aria-invalid={Boolean(state.fieldErrors?.titulo)}
          required
        />
        {state.fieldErrors?.titulo ? (
          <p className="text-destructive text-sm">{state.fieldErrors.titulo[0]}</p>
        ) : null}
      </div>

      {/* border-0/p-0/m-0/min-w-0: o preflight do Tailwind v4 NÃO reseta
          fieldset/legend (mesma decisão da pontuação abaixo). */}
      <fieldset className="grid gap-2 border-0 p-0 m-0 min-w-0">
        <legend className="text-sm font-medium pb-2">Formato</legend>
        <div className="flex items-start gap-2">
          <input
            id="formatoAvulso"
            name="formato"
            type="radio"
            value="avulso"
            checked={formato === "avulso"}
            onChange={() => setFormato("avulso")}
            className="mt-1 size-4 accent-primary"
          />
          <Label htmlFor="formatoAvulso" className="font-normal flex-col items-start gap-0.5">
            Avulso
            <span className="text-muted-foreground text-xs font-normal">
              Você cria cada partida manualmente, quando quiser.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="formatoLiga"
            name="formato"
            type="radio"
            value="liga"
            checked={formato === "liga"}
            onChange={() => setFormato("liga")}
            className="mt-1 size-4 accent-primary"
          />
          <Label htmlFor="formatoLiga" className="font-normal flex-col items-start gap-0.5">
            Liga (pontos corridos)
            <span className="text-muted-foreground text-xs font-normal">
              Todos jogam contra todos. O torneio nasce em rascunho: convide os
              participantes e a tabela é gerada quando você iniciar.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="formatoMataMata"
            name="formato"
            type="radio"
            value="mata_mata"
            checked={formato === "mata_mata"}
            onChange={() => setFormato("mata_mata")}
            className="mt-1 size-4 accent-primary"
          />
          <Label htmlFor="formatoMataMata" className="font-normal flex-col items-start gap-0.5">
            Mata-mata (eliminatórias)
            <span className="text-muted-foreground text-xs font-normal">
              Quem perde está fora. O torneio nasce em rascunho: convide os
              participantes e a chave é gerada quando você iniciar (sorteio,
              potes ou montagem manual).
            </span>
          </Label>
        </div>
        {formato !== "avulso" ? (
          <div className="ml-6 flex items-center gap-2">
            <input
              id="idaEVolta"
              name="idaEVolta"
              type="checkbox"
              className="size-4 rounded border-input accent-primary"
            />
            <Label htmlFor="idaEVolta" className="font-normal">
              {formato === "liga"
                ? "Ida e volta (dois turnos)"
                : "Ida e volta (confrontos em dois jogos; final e 3º lugar em jogo único)"}
            </Label>
          </div>
        ) : null}
        {formato === "mata_mata" ? (
          <div className="ml-6 flex items-center gap-2">
            <input
              id="terceiroLugar"
              name="terceiroLugar"
              type="checkbox"
              className="size-4 rounded border-input accent-primary"
            />
            <Label htmlFor="terceiroLugar" className="font-normal">
              Disputa de 3º lugar (perdedores das semifinais)
            </Label>
          </div>
        ) : null}
        {state.fieldErrors?.formato ? (
          <p className="text-destructive text-sm">{state.fieldErrors.formato[0]}</p>
        ) : null}
      </fieldset>

      {/* border-0/p-0/m-0/min-w-0: o preflight do Tailwind v4 NÃO reseta
          fieldset/legend — sem isso herda borda groove e padding do UA. */}
      <fieldset className="grid grid-cols-3 gap-3 border-0 p-0 m-0 min-w-0">
        <legend className="text-sm font-medium pb-2">
          Pontos por resultado
        </legend>
        <PontosInput
          campo="pontosVitoria"
          rotulo="Vitória"
          padrao={PONTUACAO_PADRAO.vitoria}
          erro={state.fieldErrors?.pontosVitoria?.[0]}
        />
        <PontosInput
          campo="pontosEmpate"
          rotulo="Empate"
          padrao={PONTUACAO_PADRAO.empate}
          erro={state.fieldErrors?.pontosEmpate?.[0]}
        />
        <PontosInput
          campo="pontosDerrota"
          rotulo="Derrota"
          padrao={PONTUACAO_PADRAO.derrota}
          erro={state.fieldErrors?.pontosDerrota?.[0]}
        />
      </fieldset>

      <div className="flex items-center gap-2">
        <input
          id="isPublic"
          name="isPublic"
          type="checkbox"
          defaultChecked
          className="size-4 rounded border-input accent-primary"
        />
        <Label htmlFor="isPublic" className="font-normal">
          Torneio público (qualquer pessoa pode ver)
        </Label>
      </div>

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
