"use client"

import { X } from "lucide-react"
import { useState, useTransition } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"

import { selectTeam } from "@/actions/teams"
import { createTournament, type TournamentFormState } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"
import type { TeamResult } from "@/schema/teamSchema"
import {
  PONTOS_MAX,
  PONTUACAO_PADRAO,
  TORNEIO_MAX_CLUBES,
  TORNEIO_MIN_CLUBES,
} from "@/schema/tournamentSchema"

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

/** Clube já adicionado: o `id` é o `teams.id` LOCAL (de `selectTeam`) — é ele
 * que vai no hidden `clubes` (o `externalId` da API não serve à FK do slot). */
interface ClubeSelecionado {
  id: string
  nome: string
  escudoUrl: string | null
  externalId: string
}

/**
 * Passo de CLUBES dos formatos competitivos (modelo clube-cêntrico): a busca
 * (TeamSearchInput) devolve um clube da API; `selectTeam` o cacheia em `teams`
 * e retorna o id LOCAL, que vira hidden `name="clubes"` (a action espera
 * `formData.getAll("clubes")` com `teams.id`). Sem duplicata; mínimo 2 (a
 * validação real é a action + RLS; o gate aqui é UX). Avulso não renderiza
 * este passo.
 */
function ClubesStep({
  clubes,
  setClubes,
  erro,
}: {
  clubes: ClubeSelecionado[]
  setClubes: React.Dispatch<React.SetStateAction<ClubeSelecionado[]>>
  erro?: string
}) {
  const [adicionando, startTransition] = useTransition()

  function adicionar(team: TeamResult) {
    if (clubes.some((c) => c.externalId === team.externalId)) {
      toast.error("Este clube já está na lista.")
      return
    }
    if (clubes.length >= TORNEIO_MAX_CLUBES) {
      toast.error(`Selecione no máximo ${TORNEIO_MAX_CLUBES} clubes.`)
      return
    }
    startTransition(async () => {
      const r = await selectTeam({
        externalId: team.externalId,
        nome: team.nome,
        escudoUrl: team.escudoUrl,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      // Corrida entre duas adições do mesmo clube (mesmo teams.id): dedup por id.
      setClubes((atual) =>
        atual.some((c) => c.id === r.teamId)
          ? atual
          : [
              ...atual,
              {
                id: r.teamId,
                nome: team.nome,
                escudoUrl: team.escudoUrl,
                externalId: team.externalId,
              },
            ]
      )
    })
  }

  function remover(id: string) {
    setClubes((atual) => atual.filter((c) => c.id !== id))
  }

  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="pb-2 text-sm font-medium">
        {`Clubes (mínimo ${TORNEIO_MIN_CLUBES})`}
      </legend>
      <p className="text-muted-foreground -mt-1 pb-1 text-xs">
        Cada clube é uma vaga: você gera um convite por clube e quem aceita vira
        o técnico (substituível depois).
      </p>

      <TeamSearchInput
        label="Buscar clube"
        placeholder={adicionando ? "Adicionando…" : "Buscar clube…"}
        onSelect={adicionar}
      />

      {/* Hidden inputs com o teams.id LOCAL — o que a action consome. */}
      {clubes.map((c) => (
        <input key={`hidden-${c.id}`} type="hidden" name="clubes" value={c.id} />
      ))}

      {clubes.length > 0 ? (
        <ul className="grid list-none gap-2 p-0">
          {clubes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <TeamCrest nome={c.nome} escudoUrl={c.escudoUrl} size={22} />
                <span className="truncate text-sm">{c.nome}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remover(c.id)}
                aria-label={`Remover ${c.nome}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-sm">
          Nenhum clube adicionado ainda.
        </p>
      )}

      {erro ? <p className="text-destructive text-sm">{erro}</p> : null}
    </fieldset>
  )
}

export function TournamentForm() {
  const [state, formAction] = useActionState(createTournament, initialState)
  // Estado local SÓ para progressive disclosure (ida-e-volta em liga e
  // mata-mata; 3º lugar só em mata-mata); o valor submetido é o do radio
  // nativo — sem ele o form continua funcional.
  const [formato, setFormato] = useState<
    "avulso" | "liga" | "mata_mata" | "grupos_mata_mata" | "fase_liga"
  >("avulso")
  // Clubes (vagas) dos formatos competitivos — submetidos como hidden
  // `clubes` pelo ClubesStep; preservados ao alternar o formato (trocar de
  // liga para mata-mata não descarta a seleção; avulso não os SUBMETE porque
  // o passo — e os hidden — não renderizam).
  const [clubes, setClubes] = useState<ClubeSelecionado[]>([])
  const temChave =
    formato === "mata_mata" || formato === "grupos_mata_mata" || formato === "fase_liga"

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
        <div className="flex items-start gap-2">
          <input
            id="formatoGrupos"
            name="formato"
            type="radio"
            value="grupos_mata_mata"
            checked={formato === "grupos_mata_mata"}
            onChange={() => setFormato("grupos_mata_mata")}
            className="mt-1 size-4 accent-primary"
          />
          <Label htmlFor="formatoGrupos" className="font-normal flex-col items-start gap-0.5">
            Grupos + mata-mata
            <span className="text-muted-foreground text-xs font-normal">
              Estilo Copa: fase de grupos classificando para as eliminatórias.
              Você define grupos e classificados ao iniciar.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="formatoFaseLiga"
            name="formato"
            type="radio"
            value="fase_liga"
            checked={formato === "fase_liga"}
            onChange={() => setFormato("fase_liga")}
            className="mt-1 size-4 accent-primary"
          />
          <Label htmlFor="formatoFaseLiga" className="font-normal flex-col items-start gap-0.5">
            Fase de liga + mata-mata
            <span className="text-muted-foreground text-xs font-normal">
              Estilo Champions: todos jogam uma liga única e os melhores avançam
              para as eliminatórias.
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
                : formato === "mata_mata"
                  ? "Ida e volta (confrontos em dois jogos; final e 3º lugar em jogo único)"
                  : "Ida e volta (dois turnos nos grupos e duas pernas na chave; final e 3º lugar em jogo único)"}
            </Label>
          </div>
        ) : null}
        {temChave ? (
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

      {/* Passo de CLUBES (vagas) — só nos formatos competitivos. */}
      {formato !== "avulso" ? (
        <ClubesStep
          clubes={clubes}
          setClubes={setClubes}
          erro={state.fieldErrors?.clubes?.[0]}
        />
      ) : null}

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
