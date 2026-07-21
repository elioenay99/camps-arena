"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { aprovarPropostaPlacar, rejeitarPropostaPlacar } from "@/actions/scoreProposals"
import { Button } from "@/components/ui/button"
import type { PropostaPendente } from "@/features/match/data/getPropostasPendentes"

/**
 * Console do APROVADOR (change add-proposta-resultado-foto): cada proposta de
 * placar pendente vira um item com a foto de evidência (rota assinada, nunca
 * <img> direto — bucket privado/efêmero) e duas ações IRREVERSÍVEIS: aprovar
 * (RPC atômico aplica placar + encerra) ou rejeitar com motivo opcional. O
 * revalidatePath das actions atualiza a lista; aqui só desabilitamos durante a
 * transição. Mesma linguagem visual dos itens de W.O. da página.
 */

/** Alvo de toque mínimo (44px) para ações irreversíveis em mobile. */
const ALVO_TOQUE = "min-h-11 px-4"

export function PropostasPendentes({
  tournamentId,
  propostas,
}: {
  tournamentId: string
  propostas: PropostaPendente[]
}) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {propostas.map((p) => (
        <ItemProposta key={p.id} tournamentId={tournamentId} proposta={p} />
      ))}
    </ul>
  )
}

function ItemProposta({
  tournamentId,
  proposta,
}: {
  tournamentId: string
  proposta: PropostaPendente
}) {
  const [rejeitando, setRejeitando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [pendente, startTransition] = useTransition()

  function aprovar() {
    startTransition(async () => {
      const r = await aprovarPropostaPlacar(proposta.id)
      if (r.ok) toast.success("Placar aprovado.")
      else toast.error(r.error)
    })
  }

  function rejeitar() {
    startTransition(async () => {
      const r = await rejeitarPropostaPlacar({
        proposalId: proposta.id,
        motivo: motivo.trim() || undefined,
      })
      if (r.ok) {
        toast.success("Proposta rejeitada.")
        setRejeitando(false)
        setMotivo("")
      } else {
        toast.error(r.error)
      }
    })
  }

  const resumo = `${proposta.lado1} ${proposta.placar_1} x ${proposta.placar_2} ${proposta.lado2}`

  return (
    <li className="flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 font-medium">{resumo}</span>
        <a
          href={`/dashboard/torneios/${tournamentId}/evidencia/placar/${proposta.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
        >
          Ver foto
        </a>
      </div>

      {/* Estado em voo para leitores de tela. */}
      <span role="status" className="sr-only">
        {pendente ? "Processando proposta…" : ""}
      </span>

      {!rejeitando ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className={ALVO_TOQUE}
            disabled={pendente}
            aria-label={`Aprovar placar ${resumo}`}
            onClick={aprovar}
          >
            Aprovar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={ALVO_TOQUE}
            disabled={pendente}
            aria-label={`Rejeitar placar ${resumo}`}
            onClick={() => setRejeitando(true)}
          >
            Rejeitar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="Motivo (opcional)"
            aria-label="Motivo da rejeição (opcional)"
            disabled={pendente}
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-none rounded-md border px-3 py-2 text-base focus-visible:ring-1 md:text-sm focus-visible:outline-none disabled:opacity-50"
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className={ALVO_TOQUE}
              disabled={pendente}
              aria-label={`Confirmar rejeição do placar ${resumo}`}
              onClick={rejeitar}
            >
              {pendente ? "Rejeitando…" : "Confirmar rejeição"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={ALVO_TOQUE}
              disabled={pendente}
              onClick={() => {
                setRejeitando(false)
                setMotivo("")
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
