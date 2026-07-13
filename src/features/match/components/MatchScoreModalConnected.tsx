"use client"

import { toast } from "sonner"

import { updateMatchScore, updateMatchTeams } from "@/actions/match"
import { proporPlacar } from "@/actions/scoreProposals"
import { sugestoesDeAutorGol } from "@/actions/scorers"
import { selectTeam } from "@/actions/teams"
import {
  MatchScoreModal,
  type MatchScoreModalProps,
} from "@/features/match/components/MatchScoreModal"

export type MatchScoreModalConnectedProps = Omit<
  MatchScoreModalProps,
  "onSave" | "onSelecionarClube" | "onEnviarProposta" | "carregarSugestoes"
> & {
  // `autoresIniciais` (preload EDITÁVEL das superfícies REPLACE) já é serializável
  // e flui direto do `...props` para o modal apresentacional.
  /**
   * Habilita a busca/troca de clube de cada lado. Só faz sentido no AVULSO (o
   * clube é cosmético por partida). No COMPETITIVO o clube vem do torneio (a
   * vaga) e é apenas EXIBIDO — sem busca. Default `false` (apenas exibe).
   */
  permitirEscolherClube?: boolean
}

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
export function MatchScoreModalConnected({
  permitirEscolherClube = false,
  modoPlacar = "direto",
  ...props
}: MatchScoreModalConnectedProps) {
  if (typeof window !== "undefined") {
    const w = window as unknown as { __DBGWO?: string[] }
    ;(w.__DBGWO ||= []).push(props.matchId)
  }
  return (
    <MatchScoreModal
      {...props}
      modoPlacar={modoPlacar}
      // Autocomplete dos autores de gol: server action lazy (só ao abrir o modal).
      carregarSugestoes={sugestoesDeAutorGol}
      onSave={async (input) => {
        const resultado = await updateMatchScore(input)
        if (!resultado.ok) {
          throw new Error(resultado.error)
        }
      }}
      // Modo proposta (técnico no competitivo): envia placar + foto para aprovação.
      onEnviarProposta={
        modoPlacar === "proposta"
          ? async ({ matchId, placar_1, placar_2, foto, autores }) => {
              const fd = new FormData()
              fd.set("matchId", matchId)
              fd.set("placar_1", String(placar_1))
              fd.set("placar_2", String(placar_2))
              fd.set("foto", foto)
              // Autores (opcional): serializados como JSON — a action faz o parse
              // defensivo. Ausente = proposta sem autores (retrocompat).
              if (autores !== undefined) fd.set("autores", JSON.stringify(autores))
              const r = await proporPlacar(fd)
              if (!r.ok) throw new Error(r.error)
            }
          : undefined
      }
      // Sem a busca no competitivo: o clube vem do torneio e é só exibido.
      onSelecionarClube={
        permitirEscolherClube
          ? async (lado, team) => {
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
            }
          : undefined
      }
    />
  )
}
