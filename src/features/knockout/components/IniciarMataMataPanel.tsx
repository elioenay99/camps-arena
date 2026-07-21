"use client"

import { Hand, Layers, Network, Shuffle } from "lucide-react"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { iniciarMataMata, type TournamentFormState } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SelectNative } from "@/components/ui/select-native"
import {
  MATA_MATA_MAX_PARTICIPANTES,
  previaMataMata,
  TAMANHOS_POTES,
  tamanhoChave,
  type ModoChaveamento,
} from "@/features/knockout/gerarChaveMataMata"
import {
  ModoCard,
  PainelInicioShell,
  PreviaBox,
} from "@/features/tournament/components/iniciar-panel-ui"
import type { TournamentStatus } from "@/lib/supabase/database.types"

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
  status = "rascunho",
}: {
  tournamentId: string
  participantes: Participante[]
  idaEVolta: boolean
  terceiroLugar: boolean
  status?: TournamentStatus
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

  const chips = [
    ...(idaEVolta ? ["ida e volta"] : []),
    ...(terceiroLugar ? ["3º lugar"] : []),
  ]

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
    <PainelInicioShell
      Icon={Network}
      formatoLabel="Mata-mata"
      qtdClubes={qtd}
      chips={chips}
      status={status}
    >
      {suficientes && dentroDoLimite ? (
        <PreviaBox>
          {`Ao iniciar, a chave é gerada: ${previa.jogos} ${previa.jogos === 1 ? "jogo" : "jogos"} em ${previa.fases} ${previa.fases === 1 ? "fase" : "fases"}${byes > 0 ? ` (${byes} ${byes === 1 ? "clube avança direto na 1ª fase" : "clubes avançam direto na 1ª fase"})` : ""}. A lista de clubes fica fixa; técnicos podem assumir as vagas a qualquer momento.`}
        </PreviaBox>
      ) : suficientes ? (
        <p className="text-destructive text-sm" role="alert">
          {`O mata-mata aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} clubes. Crie o torneio novamente com menos clubes.`}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          O mata-mata precisa de pelo menos 2 clubes.
          Compartilhe o link de convite abaixo para chamar os jogadores.
        </p>
      )}

      {suficientes && dentroDoLimite ? (
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="tournamentId" value={tournamentId} />

          {/* border-0/p-0/m-0/min-w-0: o preflight do Tailwind v4 NÃO reseta
              fieldset/legend (mesma decisão do TournamentForm). */}
          <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
            <legend className="pb-2 text-sm font-medium">Chaveamento</legend>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <ModoCard
                name="modo"
                value="sorteio"
                checked={modo === "sorteio"}
                onChange={() => setModo("sorteio")}
                Icon={Shuffle}
                titulo="Sorteio"
                descricao="Os confrontos são sorteados automaticamente."
              />
              <ModoCard
                name="modo"
                value="potes"
                checked={modo === "potes"}
                onChange={() => setModo("potes")}
                disabled={!potesValido}
                Icon={Layers}
                titulo="Sorteio com potes"
                descricao={
                  potesValido
                    ? "Marque as cabeças de chave: cada confronto cruza uma cabeça com um não-cabeça."
                    : `Exige ${TAMANHOS_POTES.join(", ")} clubes (chave completa).`
                }
              />
              <ModoCard
                name="modo"
                value="manual"
                checked={modo === "manual"}
                onChange={() => setModo("manual")}
                Icon={Hand}
                titulo="Montagem manual"
                descricao="Você define cada confronto da 1ª fase."
              />
            </div>
          </fieldset>

          {modo === "potes" && potesValido ? (
            <fieldset className="animate-rise bg-muted/20 m-0 grid min-w-0 gap-2 rounded-xl border p-4">
              <legend className="px-1 text-sm font-medium">
                {`Cabeças de chave (marque ${qtd / 2})`}
              </legend>
              {participantes.map((p) => (
                <Label
                  key={p.id}
                  htmlFor={`cabeca-${p.id}`}
                  className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-background flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 font-normal transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    id={`cabeca-${p.id}`}
                    name="cabecas"
                    type="checkbox"
                    value={p.id}
                    className="border-input accent-primary size-4 rounded"
                  />
                  {nomeOuFallback(p.nome)}
                </Label>
              ))}
            </fieldset>
          ) : null}

          {modo === "manual" ? (
            <fieldset className="animate-rise bg-muted/20 m-0 grid min-w-0 gap-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-medium">
                {`Confrontos da 1ª fase${byes > 0 ? ` (deixe ${byes} ${byes === 1 ? "lado vazio" : "lados vazios"} — bye)` : ""}`}
              </legend>
              {Array.from({ length: confrontos }, (_, i) => i + 1).map((slot) => (
                <div key={slot} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <SelectNative
                    name={`slot_${slot}_1`}
                    aria-label={`Confronto ${slot}, lado 1`}
                    className="md:h-9"
                    defaultValue=""
                  >
                    {opcoes}
                  </SelectNative>
                  <span className="text-muted-foreground text-xs">×</span>
                  <SelectNative
                    name={`slot_${slot}_2`}
                    aria-label={`Confronto ${slot}, lado 2`}
                    className="md:h-9"
                    defaultValue=""
                  >
                    {opcoes}
                  </SelectNative>
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
    </PainelInicioShell>
  )
}
