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
import { FORMATO_META } from "@/features/tournament/formatoMeta"
import type { TeamResult } from "@/schema/teamSchema"
import {
  PONTOS_MAX,
  PONTUACAO_PADRAO,
  TORNEIO_MAX_CLUBES,
  TORNEIO_MIN_CLUBES,
} from "@/schema/tournamentSchema"
import type { TournamentFormat } from "@/lib/supabase/database.types"

const initialState: TournamentFormState = {}

/** Ordem dos cards — avulso primeiro (o mais simples). */
const FORMATOS: TournamentFormat[] = [
  "avulso",
  "liga",
  "mata_mata",
  "grupos_mata_mata",
  "fase_liga",
]

function FormatoCard({
  value,
  selecionado,
  onSelect,
}: {
  value: TournamentFormat
  selecionado: boolean
  onSelect: () => void
}) {
  const { label, desc, Icon } = FORMATO_META[value]
  return (
    <label
      className={`relative flex cursor-pointer flex-col gap-2.5 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background ${
        selecionado
          ? "border-primary bg-primary/8 ring-1 ring-primary/40"
          : "border-border hover:border-primary/40 hover:bg-accent/40"
      }`}
    >
      <input
        type="radio"
        name="formato"
        value={value}
        checked={selecionado}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex size-9 items-center justify-center rounded-lg transition-colors ${
          selecionado ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm leading-none font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{desc}</span>
      </span>
    </label>
  )
}

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
    <Button
      type="submit"
      size="lg"
      className="w-full rounded-full"
      disabled={pending}
    >
      {pending ? "Criando…" : "Criar torneio"}
    </Button>
  )
}

/** Linha de opção (checkbox) — usada para ida-e-volta, 3º lugar e visibilidade. */
function OpcaoCheckbox({
  id,
  rotulo,
  defaultChecked,
}: {
  id: string
  rotulo: string
  defaultChecked?: boolean
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card/40 px-3 py-2.5 transition-colors hover:border-primary/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
    >
      <input
        id={id}
        name={id}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="size-4 rounded border-input accent-primary"
      />
      <span className="text-sm">{rotulo}</span>
    </label>
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
      <legend className="flex items-baseline gap-2 pb-1 text-sm font-medium">
        Clubes
        <span className="text-muted-foreground text-xs font-normal">
          {`mínimo ${TORNEIO_MIN_CLUBES} · ${clubes.length} adicionado${clubes.length === 1 ? "" : "s"}`}
        </span>
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
              className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
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
  // Estado local SÓ para progressive disclosure; o valor submetido é o do radio
  // nativo (name="formato") — sem ele o form continua funcional.
  const [formato, setFormato] = useState<TournamentFormat>("avulso")
  // Clubes (vagas) dos formatos competitivos — submetidos como hidden `clubes`
  // pelo ClubesStep; preservados ao alternar o formato (a state vive aqui).
  const [clubes, setClubes] = useState<ClubeSelecionado[]>([])

  const ehCompetitivo = formato !== "avulso"
  const temChave =
    formato === "mata_mata" ||
    formato === "grupos_mata_mata" ||
    formato === "fase_liga"
  // Pontos só importam onde há TABELA (liga e os formatos com fase de pontos).
  const usaPontos =
    formato === "liga" ||
    formato === "grupos_mata_mata" ||
    formato === "fase_liga"

  const labelIdaEVolta =
    formato === "liga"
      ? "Ida e volta (dois turnos)"
      : formato === "mata_mata"
        ? "Ida e volta (confrontos em dois jogos; final e 3º em jogo único)"
        : "Ida e volta (turnos nos grupos e duas pernas na chave)"

  return (
    <form action={formAction} className="grid gap-6" noValidate>
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
          fieldset/legend (mesma decisão da pontuação). */}
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <legend className="pb-2 text-sm font-medium">Formato</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FORMATOS.map((f) => (
            <FormatoCard
              key={f}
              value={f}
              selecionado={formato === f}
              onSelect={() => setFormato(f)}
            />
          ))}
        </div>
        {state.fieldErrors?.formato ? (
          <p className="text-destructive text-sm">{state.fieldErrors.formato[0]}</p>
        ) : null}
      </fieldset>

      {/* Configuração do formato — só aparece (e anima) fora do avulso. */}
      {ehCompetitivo ? (
        <div
          key={formato}
          className="animate-rise grid gap-4 rounded-xl border bg-muted/20 p-4"
        >
          <ClubesStep
            clubes={clubes}
            setClubes={setClubes}
            erro={state.fieldErrors?.clubes?.[0]}
          />

          <div className="grid gap-2.5">
            <OpcaoCheckbox id="idaEVolta" rotulo={labelIdaEVolta} />
            {temChave ? (
              <OpcaoCheckbox
                id="terceiroLugar"
                rotulo="Disputa de 3º lugar (perdedores das semifinais)"
              />
            ) : null}
          </div>

          {usaPontos ? (
            <fieldset className="m-0 grid min-w-0 grid-cols-3 gap-3 border-0 p-0">
              <legend className="pb-2 text-sm font-medium">
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
          ) : null}
        </div>
      ) : null}

      <OpcaoCheckbox
        id="isPublic"
        rotulo="Torneio público (qualquer pessoa pode ver)"
        defaultChecked
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
