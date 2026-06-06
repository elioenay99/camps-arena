"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { iniciarMataMata, type TournamentFormState } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  MATA_MATA_MAX_PARTICIPANTES,
  previaMataMata,
  TAMANHOS_POTES,
  tamanhoChave,
  type ModoChaveamento,
} from "@/features/knockout/gerarChaveMataMata"

const initialState: TournamentFormState = {}

interface Participante {
  id: string
  nome: string | null
}

function nomeOuFallback(nome: string | null): string {
  return nome?.trim() || "Sem nome"
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Gerando chave…" : "Iniciar torneio"}
    </Button>
  )
}

/**
 * Painel "Iniciar torneio" do mata-mata (console do dono, gate na página).
 * Client por necessidade: o MODO de chaveamento é progressive disclosure
 * (potes pede cabeças de chave; manual pede a montagem dos confrontos) e o
 * payload viaja no MESMO form da action. A prévia usa o MESMO motor da
 * geração (fonte única); validação real na action + RLS + índice único.
 */
export function IniciarMataMataPanel({
  tournamentId,
  participantes,
  idaEVolta,
  terceiroLugar,
}: {
  tournamentId: string
  participantes: Participante[]
  idaEVolta: boolean
  terceiroLugar: boolean
}) {
  const [state, formAction] = useActionState(iniciarMataMata, initialState)
  const [modo, setModo] = useState<ModoChaveamento>("sorteio")

  const qtd = participantes.length
  const previa = previaMataMata(qtd, idaEVolta, terceiroLugar)
  const suficientes = qtd >= 2
  const dentroDoLimite = qtd <= MATA_MATA_MAX_PARTICIPANTES
  const potesValido = (TAMANHOS_POTES as readonly number[]).includes(qtd)
  const confrontos = suficientes ? tamanhoChave(qtd) / 2 : 0
  const byes = suficientes ? tamanhoChave(qtd) - qtd : 0

  const opcoes = (
    <>
      <option value="">— vazio (bye) —</option>
      {participantes.map((p) => (
        <option key={p.id} value={p.id}>
          {nomeOuFallback(p.nome)}
        </option>
      ))}
    </>
  )

  return (
    <section
      aria-labelledby="iniciar-titulo"
      className="flex flex-col gap-3 rounded-lg border px-4 py-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="iniciar-titulo" className="text-lg font-semibold">
          Iniciar torneio
        </h2>
        <p className="text-muted-foreground text-sm">
          {`Mata-mata em rascunho • ${qtd} ${qtd === 1 ? "participante confirmado" : "participantes confirmados"}${idaEVolta ? " • ida e volta" : ""}${terceiroLugar ? " • com 3º lugar" : ""}`}
        </p>
      </div>

      {suficientes && dentroDoLimite ? (
        <p className="text-sm">
          {`Ao iniciar, a chave é gerada: ${previa.jogos} ${previa.jogos === 1 ? "jogo" : "jogos"} em ${previa.fases} ${previa.fases === 1 ? "fase" : "fases"}${byes > 0 ? ` (${byes} ${byes === 1 ? "participante avança direto na 1ª fase" : "participantes avançam direto na 1ª fase"})` : ""}. Depois disso ninguém mais entra no torneio.`}
        </p>
      ) : suficientes ? (
        <p className="text-destructive text-sm" role="alert">
          {`O mata-mata aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} participantes. Remova participantes para iniciar.`}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          O mata-mata precisa de pelo menos 2 participantes confirmados.
          Compartilhe o link de convite abaixo para chamar os jogadores.
        </p>
      )}

      {suficientes && dentroDoLimite ? (
        <form action={formAction} className="flex flex-col gap-3" noValidate>
          <input type="hidden" name="tournamentId" value={tournamentId} />

          {/* border-0/p-0/m-0/min-w-0: o preflight do Tailwind v4 NÃO reseta
              fieldset/legend (mesma decisão do TournamentForm). */}
          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
            <legend className="pb-2 text-sm font-medium">Chaveamento</legend>
            <div className="flex items-start gap-2">
              <input
                id="modoSorteio"
                name="modo"
                type="radio"
                value="sorteio"
                checked={modo === "sorteio"}
                onChange={() => setModo("sorteio")}
                className="accent-primary mt-1 size-4"
              />
              <Label htmlFor="modoSorteio" className="flex-col items-start gap-0.5 font-normal">
                Sorteio
                <span className="text-muted-foreground text-xs font-normal">
                  Os confrontos são sorteados automaticamente.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <input
                id="modoPotes"
                name="modo"
                type="radio"
                value="potes"
                checked={modo === "potes"}
                onChange={() => setModo("potes")}
                disabled={!potesValido}
                className="accent-primary mt-1 size-4"
              />
              <Label htmlFor="modoPotes" className="flex-col items-start gap-0.5 font-normal">
                Sorteio com potes
                <span className="text-muted-foreground text-xs font-normal">
                  {potesValido
                    ? "Marque as cabeças de chave: cada confronto cruza uma cabeça com um não-cabeça."
                    : `Exige ${TAMANHOS_POTES.join(", ")} participantes (chave completa).`}
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <input
                id="modoManual"
                name="modo"
                type="radio"
                value="manual"
                checked={modo === "manual"}
                onChange={() => setModo("manual")}
                className="accent-primary mt-1 size-4"
              />
              <Label htmlFor="modoManual" className="flex-col items-start gap-0.5 font-normal">
                Montagem manual
                <span className="text-muted-foreground text-xs font-normal">
                  Você define cada confronto da 1ª fase.
                </span>
              </Label>
            </div>
          </fieldset>

          {modo === "potes" && potesValido ? (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="pb-2 text-sm font-medium">
                {`Cabeças de chave (marque ${qtd / 2})`}
              </legend>
              {participantes.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <input
                    id={`cabeca-${p.id}`}
                    name="cabecas"
                    type="checkbox"
                    value={p.id}
                    className="border-input accent-primary size-4 rounded"
                  />
                  <Label htmlFor={`cabeca-${p.id}`} className="font-normal">
                    {nomeOuFallback(p.nome)}
                  </Label>
                </div>
              ))}
            </fieldset>
          ) : null}

          {modo === "manual" ? (
            <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
              <legend className="pb-2 text-sm font-medium">
                {`Confrontos da 1ª fase${byes > 0 ? ` (deixe ${byes} ${byes === 1 ? "lado vazio" : "lados vazios"} — bye)` : ""}`}
              </legend>
              {Array.from({ length: confrontos }, (_, i) => i + 1).map((slot) => (
                <div key={slot} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <select
                    name={`slot_${slot}_1`}
                    aria-label={`Confronto ${slot}, lado 1`}
                    className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                    defaultValue=""
                  >
                    {opcoes}
                  </select>
                  <span className="text-muted-foreground text-xs">×</span>
                  <select
                    name={`slot_${slot}_2`}
                    aria-label={`Confronto ${slot}, lado 2`}
                    className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                    defaultValue=""
                  >
                    {opcoes}
                  </select>
                </div>
              ))}
            </fieldset>
          ) : null}

          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}

          <div>
            <SubmitButton disabled={modo === "potes" && !potesValido} />
          </div>
        </form>
      ) : null}
    </section>
  )
}
