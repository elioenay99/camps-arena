"use client"

import { useId, useState, useTransition } from "react"
import { Loader2, Trophy } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  atualizarCoresDivisao,
  atualizarCoresPiramide,
} from "@/actions/leaguePyramid"
import { atualizarCoresTorneio } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { ColorField } from "@/components/ui/color-field"
import { champThemeProps } from "@/features/championship/championshipTheme"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import type { CoresInput } from "@/schema/corSchema"
import { cn } from "@/lib/utils"

const HEX6 = /^#[0-9a-fA-F]{6}$/

/**
 * Alvo da edição: identifica qual action persiste as cores. Discriminado por
 * `tipo` — o id é o do torneio, da pirâmide (competition) ou da divisão-temporada.
 */
export type ColorsTarget =
  | { tipo: "torneio"; tournamentId: string }
  | { tipo: "piramide"; competitionId: string }
  | { tipo: "divisao"; divisionSeasonId: string }

async function persistir(
  alvo: ColorsTarget,
  cores: CoresInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (alvo.tipo === "torneio") {
    return atualizarCoresTorneio(alvo.tournamentId, cores)
  }
  if (alvo.tipo === "piramide") {
    return atualizarCoresPiramide(alvo.competitionId, cores)
  }
  return atualizarCoresDivisao(alvo.divisionSeasonId, cores)
}

export type ChampionshipColorsFormProps = {
  /** Cores atuais (snake/null do banco) — string vazia = sem cor. */
  primariaInicial: string
  secundariaInicial: string
  /** Rótulo do alvo no preview/copy (ex.: "Copa da Firma", "Divisão 1"). */
  alvoLabel: string
  /** Identifica a action de persistência (torneio / pirâmide / divisão). */
  alvo: ColorsTarget
}

/**
 * Editor de identidade de um campeonato (torneio OU divisão/pirâmide) com
 * PREVIEW AO VIVO: um mini-cabeçalho tematizado + botão refletem as cores
 * enquanto se edita. change add-cores-campeonato. Folha interativa (estado
 * local + transition + sonner); a action certa é escolhida por `alvo.tipo`.
 */
export function ChampionshipColorsForm({
  primariaInicial,
  secundariaInicial,
  alvoLabel,
  alvo,
}: ChampionshipColorsFormProps) {
  const router = useRouter()
  const previewId = useId()
  const [primaria, setPrimaria] = useState(primariaInicial)
  const [secundaria, setSecundaria] = useState(secundariaInicial)
  const [salvando, salvar] = useTransition()

  const primariaValida = primaria === "" || HEX6.test(primaria)
  const secundariaValida = secundaria === "" || HEX6.test(secundaria)
  const podeSalvar = primariaValida && secundariaValida && !salvando

  // Preview usa só hex VÁLIDOS (o que entrará no banco): nada de cor parcial.
  const previewPrimaria = HEX6.test(primaria) ? primaria : null
  const previewSecundaria = HEX6.test(secundaria) ? secundaria : null
  const previewTheme = champThemeProps(previewPrimaria, previewSecundaria)

  function enviar() {
    if (!podeSalvar) return
    salvar(async () => {
      const r = await persistir(alvo, {
        corPrimaria: primaria === "" ? undefined : primaria,
        corSecundaria: secundaria === "" ? undefined : secundaria,
      })
      if (r.ok) {
        toast.success("Cores atualizadas.")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* PREVIEW AO VIVO — mini-cabeçalho tematizado pela cor sendo editada. */}
      <div
        className={cn(
          "elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-4",
          previewTheme?.className,
        )}
        style={previewTheme?.style}
        aria-labelledby={previewId}
      >
        <p
          id={previewId}
          className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
        >
          Prévia
        </p>
        <div className="flex items-center gap-3">
          <ChampionshipBadge
            icon={<Trophy className="size-5" />}
            primary={previewPrimaria}
            secondary={previewSecundaria}
            className="size-11 rounded-xl ring-1 ring-primary/20"
          />
          <div className="flex min-w-0 flex-col">
            <span className="font-display truncate text-lg font-bold tracking-tight">
              {alvoLabel.trim() || "Campeonato"}
            </span>
            <span className="text-muted-foreground text-xs">
              {previewPrimaria ? "Tema personalizado" : "Tema base do app"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="rounded-full" type="button">
            Botão primário
          </Button>
          <span className="border-primary/40 text-primary inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
            Acesso
          </span>
          <span className="border-destructive/40 text-destructive inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
            Queda
          </span>
        </div>
      </div>

      {/* CONTROLES */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ColorField
          label="Cor primária"
          value={primaria}
          onChange={setPrimaria}
          description="A cor pervasiva (botões, destaques, acesso)."
        />
        <ColorField
          label="Cor secundária"
          value={secundaria}
          onChange={setSecundaria}
          description="Compõe o gradiente do escudo. Vazio usa o tema do app."
        />
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          className="rounded-full"
          onClick={enviar}
          disabled={!podeSalvar}
        >
          {salvando ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Salvando…
            </>
          ) : (
            "Salvar cores"
          )}
        </Button>
      </div>
    </div>
  )
}
