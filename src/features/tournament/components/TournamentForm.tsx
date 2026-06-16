"use client"

import { X } from "lucide-react"
import { useState, useTransition } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"

import { selectTeam } from "@/actions/teams"
import { createTournament, type TournamentFormState } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { ColorField } from "@/components/ui/color-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"
import { FORMATO_META } from "@/features/tournament/formatoMeta"
import type { TeamResult } from "@/schema/teamSchema"
import {
  NOME_MAX,
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
        aria-describedby={erro ? `${campo}-erro` : undefined}
      />
      {erro ? (
        <p id={`${campo}-erro`} role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
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
    <fieldset
      className="m-0 grid min-w-0 gap-2 border-0 p-0"
      aria-describedby={erro ? "clubes-erro" : undefined}
    >
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

      {erro ? (
        <p id="clubes-erro" role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
    </fieldset>
  )
}

/**
 * Passo de COMPETIDORES POR NOME (modo `porNome`): em vez de buscar clubes
 * reais, o dono digita nomes — cada um vira uma vaga sem clube, sem técnico e
 * sem convite. Nomes únicos (case-insensitive); submetidos como hidden `nomes`.
 */
function NomesStep({
  nomes,
  setNomes,
  erro,
}: {
  nomes: string[]
  setNomes: React.Dispatch<React.SetStateAction<string[]>>
  erro?: string
}) {
  const [texto, setTexto] = useState("")

  function adicionar() {
    const nome = texto.trim()
    if (!nome) return
    if (nome.length > NOME_MAX) {
      toast.error(`Nome muito longo (máx. ${NOME_MAX}).`)
      return
    }
    if (nomes.some((n) => n.toLowerCase() === nome.toLowerCase())) {
      toast.error("Esse nome já está na lista.")
      return
    }
    if (nomes.length >= TORNEIO_MAX_CLUBES) {
      toast.error(`Informe no máximo ${TORNEIO_MAX_CLUBES} nomes.`)
      return
    }
    setNomes((atual) => [...atual, nome])
    setTexto("")
  }

  return (
    <fieldset
      className="m-0 grid min-w-0 gap-2 border-0 p-0"
      aria-describedby={erro ? "nomes-erro" : undefined}
    >
      <legend className="flex items-baseline gap-2 pb-1 text-sm font-medium">
        Competidores
        <span className="text-muted-foreground text-xs font-normal">
          {`mínimo ${TORNEIO_MIN_CLUBES} · ${nomes.length} adicionado${nomes.length === 1 ? "" : "s"}`}
        </span>
      </legend>
      <p className="text-muted-foreground -mt-1 pb-1 text-xs">
        Cada nome é um competidor — sem clube, sem convite. Você lança os placares.
      </p>

      <div className="flex gap-2">
        <Input
          aria-label="Nome do competidor"
          placeholder="Ex.: João"
          value={texto}
          maxLength={NOME_MAX}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              adicionar()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={adicionar}>
          Adicionar
        </Button>
      </div>

      {/* Hidden inputs com os nomes — o que a action consome (getAll("nomes")). */}
      {nomes.map((n, i) => (
        <input key={`hidden-${i}`} type="hidden" name="nomes" value={n} />
      ))}

      {nomes.length > 0 ? (
        <ul className="grid list-none gap-2 p-0">
          {nomes.map((n, i) => (
            <li
              key={`${n}-${i}`}
              className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <span className="truncate text-sm">{n}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setNomes((atual) => atual.filter((_, idx) => idx !== i))}
                aria-label={`Remover ${n}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-sm">
          Nenhum competidor adicionado ainda.
        </p>
      )}

      {erro ? (
        <p id="nomes-erro" role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      ) : null}
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
  // Modo "competidores por nome": digita nomes em vez de buscar clubes.
  const [porNome, setPorNome] = useState(false)
  const [nomes, setNomes] = useState<string[]>([])
  // Identidade (change add-cores-campeonato): cores opcionais. Estado local
  // controlado; o `name` submete o valor via FormData (createTournament lê
  // corPrimaria/corSecundaria). Vazio ⇒ tema base do app.
  const [corPrimaria, setCorPrimaria] = useState("")
  const [corSecundaria, setCorSecundaria] = useState("")

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
          aria-describedby={state.fieldErrors?.titulo ? "titulo-erro" : undefined}
          required
        />
        {state.fieldErrors?.titulo ? (
          <p id="titulo-erro" role="alert" className="text-destructive text-sm">
            {state.fieldErrors.titulo[0]}
          </p>
        ) : null}
      </div>

      {/* border-0/p-0/m-0/min-w-0: o preflight do Tailwind v4 NÃO reseta
          fieldset/legend (mesma decisão da pontuação). */}
      <fieldset
        className="m-0 grid min-w-0 gap-3 border-0 p-0"
        aria-describedby={state.fieldErrors?.formato ? "formato-erro" : undefined}
      >
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
          <p id="formato-erro" role="alert" className="text-destructive text-sm">
            {state.fieldErrors.formato[0]}
          </p>
        ) : null}
      </fieldset>

      {/* Configuração do formato — só aparece (e anima) fora do avulso. */}
      {ehCompetitivo ? (
        <div
          key={formato}
          className="animate-rise grid gap-4 rounded-xl border bg-muted/20 p-4"
        >
          {/* Toggle: clubes reais (busca) × competidores por nome (digitados). */}
          <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
            <input
              type="checkbox"
              name="porNome"
              checked={porNome}
              onChange={(e) => setPorNome(e.target.checked)}
              className="border-input accent-primary size-4 rounded"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">Competidores por nome</span>
              <span className="text-muted-foreground text-xs">
                Em vez de clubes reais, digite os nomes dos jogadores (sem escudo,
                sem convite — você lança os placares).
              </span>
            </span>
          </label>

          {porNome ? (
            <NomesStep
              nomes={nomes}
              setNomes={setNomes}
              erro={state.fieldErrors?.nomes?.[0]}
            />
          ) : (
            <ClubesStep
              clubes={clubes}
              setClubes={setClubes}
              erro={state.fieldErrors?.clubes?.[0]}
            />
          )}

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

      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <legend className="text-sm font-medium">Identidade (opcional)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ColorField
            label="Cor primária"
            name="corPrimaria"
            value={corPrimaria}
            onChange={setCorPrimaria}
          />
          <ColorField
            label="Cor secundária"
            name="corSecundaria"
            value={corSecundaria}
            onChange={setCorSecundaria}
            description="Deixe vazio para usar o tema do app."
          />
        </div>
      </fieldset>

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
