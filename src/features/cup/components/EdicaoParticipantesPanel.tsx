"use client"

import {
  ChevronDown,
  ChevronUp,
  Hammer,
  RefreshCw,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import {
  ajustarParticipantesCopa,
  derivarVagasCopa,
  montarEdicaoCopa,
} from "@/actions/cups"
import { selectTeam } from "@/actions/teams"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"
import { validarGeometriaCopa } from "@/features/cup/derivacao"
import type { CupFormat } from "@/lib/supabase/database.types"
import type { ParticipanteEdicao } from "@/features/cup/data/getEdicao"
import type { TeamResult } from "@/schema/teamSchema"

export interface EdicaoParticipantesPanelProps {
  cupSeasonId: string
  formato: CupFormat
  porNome: boolean
  qtdGrupos: number | null
  classificadosPorGrupo: number | null
  participantes: ParticipanteEdicao[]
}

/**
 * Painel de participantes de uma edição em RASCUNHO (dono): derivar vagas das
 * origens, ajustar manualmente (adicionar/remover/reordenar) e montar a chave.
 * Sinaliza a geometria (pool > 32 / grupos que não fecham) ANTES de montar.
 * Todas as mutações via Server Actions; a lista vem do RSC (router.refresh()).
 */
export function EdicaoParticipantesPanel({
  cupSeasonId,
  formato,
  porNome,
  qtdGrupos,
  classificadosPorGrupo,
  participantes,
}: EdicaoParticipantesPanelProps) {
  const router = useRouter()
  const [derivando, startDerivar] = React.useTransition()
  const [montando, startMontar] = React.useTransition()
  const [ajustando, startAjustar] = React.useTransition()
  const [texto, setTexto] = React.useState("")

  const n = participantes.length
  const geometria = validarGeometriaCopa(formato, n, qtdGrupos, classificadosPorGrupo)
  const podeMontar = geometria.ok && !montando && !ajustando && !derivando
  // Qualquer mutação em voo bloqueia TODOS os controles de ajuste (e vice-versa o
  // botão Derivar é bloqueado por `ajustando`): evita derivar durante um ajuste manual
  // — e ajustar durante uma derivação/montagem — sobre um estado inconsistente.
  const ajusteBloqueado = ajustando || derivando || montando

  function derivar() {
    startDerivar(async () => {
      const r = await derivarVagasCopa(cupSeasonId)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      if (r.lacunas.length > 0) {
        toast.warning(
          `Pool derivado com ${r.total} ${r.total === 1 ? "vaga" : "vagas"}. ${r.lacunas.length} ${r.lacunas.length === 1 ? "vaga ficou vazia" : "vagas ficaram vazias"} (origem esgotada).`
        )
      } else {
        toast.success(
          `Pool derivado: ${r.total} ${r.total === 1 ? "participante" : "participantes"}.`
        )
      }
      router.refresh()
    })
  }

  function adicionarClube(team: TeamResult) {
    startAjustar(async () => {
      const sel = await selectTeam({
        externalId: team.externalId,
        nome: team.nome,
        escudoUrl: team.escudoUrl,
      })
      if (!sel.ok) {
        toast.error(sel.error)
        return
      }
      const r = await ajustarParticipantesCopa(cupSeasonId, {
        tipo: "adicionar",
        teamId: sel.teamId,
      })
      if (r.ok) {
        toast.success(`${team.nome} adicionado.`)
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function adicionarNome() {
    const rotulo = texto.trim()
    if (!rotulo) return
    startAjustar(async () => {
      const r = await ajustarParticipantesCopa(cupSeasonId, { tipo: "adicionar", rotulo })
      if (r.ok) {
        toast.success(`${rotulo} adicionado.`)
        setTexto("")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function remover(entryId: string, nome: string) {
    startAjustar(async () => {
      const r = await ajustarParticipantesCopa(cupSeasonId, { tipo: "remover", entryId })
      if (r.ok) {
        toast.success(`${nome} removido.`)
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function mover(idx: number, dir: -1 | 1) {
    const alvo = idx + dir
    if (alvo < 0 || alvo >= participantes.length) return
    const ordem = participantes.map((p) => p.id)
    ;[ordem[idx], ordem[alvo]] = [ordem[alvo], ordem[idx]]
    startAjustar(async () => {
      const r = await ajustarParticipantesCopa(cupSeasonId, {
        tipo: "reordenar",
        ordemEntryIds: ordem,
      })
      if (r.ok) {
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function montar() {
    startMontar(async () => {
      const r = await montarEdicaoCopa(cupSeasonId)
      if (r.ok) {
        toast.success("Edição montada! Agora é só iniciar.")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Ações de derivação. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={derivar}
          disabled={derivando || montando || ajustando}
          variant="outline"
          size="sm"
          className="min-h-11 rounded-full px-4"
        >
          {n > 0 ? (
            <RefreshCw aria-hidden="true" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          {derivando ? "Derivando…" : n > 0 ? "Re-derivar vagas" : "Derivar vagas"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Lê as origens e monta o pool: por faixa de classificação (temporada
          encerrada) ou todos os clubes da divisão (mesmo em disputa).
        </p>
      </div>

      {/* Adicionar participante manual. */}
      {porNome ? (
        <div className="flex gap-2">
          <Input
            aria-label="Nome do participante"
            placeholder="Ex.: Seleção da Vila"
            value={texto}
            maxLength={80}
            disabled={ajusteBloqueado}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                adicionarNome()
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={adicionarNome}
            disabled={ajusteBloqueado}
            className="min-h-11"
          >
            <UserPlus aria-hidden="true" />
            Adicionar
          </Button>
        </div>
      ) : (
        <TeamSearchInput
          label="Adicionar clube manualmente"
          placeholder={ajustando ? "Adicionando…" : "Buscar clube…"}
          disabled={ajusteBloqueado}
          onSelect={adicionarClube}
        />
      )}

      {/* Lista de participantes (ordem de seeding). */}
      {participantes.length > 0 ? (
        <ol className="grid list-none gap-2 p-0">
          {participantes.map((p, i) => (
            <li
              key={p.id}
              // Os 3 botões de 44px somam 132px `shrink-0`: na mesma linha do
              // nome sobravam ~112px, e a linha de ORIGEM — única forma de
              // conferir de onde veio uma vaga derivada — ficava ilegível.
              className="bg-card flex flex-col gap-1.5 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:gap-2"
            >
              <span className="flex min-w-0 items-center gap-2 sm:flex-1">
                <span
                  aria-hidden="true"
                  className="bg-muted text-muted-foreground font-display flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums"
                >
                  {i + 1}
                </span>
                {p.teamId ? (
                  <TeamCrest nome={p.nome} escudoUrl={p.escudoUrl} size={22} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-muted text-muted-foreground flex size-[22px] shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold"
                  >
                    {p.nome.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{p.nome}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {p.manual
                      ? "Adicionado manualmente"
                      : (p.origemDescricao ?? "Derivado")}
                  </span>
                </span>
              </span>
              {/* `gap-1` no mobile: "para cima" e "para baixo" são ações opostas
                  e estavam borda com borda. Em `sm:` o par volta a colar. */}
              <div className="flex shrink-0 items-center gap-1 self-end sm:gap-0 sm:self-auto">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="min-h-11 min-w-11"
                  disabled={ajusteBloqueado || i === 0}
                  onClick={() => mover(i, -1)}
                  aria-label={`Mover ${p.nome} para cima`}
                >
                  <ChevronUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="min-h-11 min-w-11"
                  disabled={ajusteBloqueado || i === participantes.length - 1}
                  onClick={() => mover(i, 1)}
                  aria-label={`Mover ${p.nome} para baixo`}
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="min-h-11 min-w-11"
                  disabled={ajusteBloqueado}
                  onClick={() => remover(p.id, p.nome)}
                  aria-label={`Remover ${p.nome}`}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-8 text-center text-sm">
          Nenhum participante ainda. Derive as vagas das origens ou adicione
          manualmente.
        </p>
      )}

      {/* Sinalização da geometria + botão Montar. */}
      <div className="flex flex-col gap-3 border-t pt-4">
        {!geometria.ok && n > 0 ? (
          <p className="text-destructive text-sm" role="alert">
            {geometria.mensagem}
          </p>
        ) : geometria.ok ? (
          <p className="text-muted-foreground text-xs">
            {n} {n === 1 ? "participante" : "participantes"} — pronto para montar.
          </p>
        ) : null}
        <Button
          onClick={montar}
          disabled={!podeMontar}
          size="lg"
          className="self-start rounded-full"
        >
          <Hammer aria-hidden="true" />
          {montando ? "Montando…" : "Montar edição"}
        </Button>
      </div>
    </div>
  )
}
