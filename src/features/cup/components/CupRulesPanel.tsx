"use client"

import { Check, Pencil, X } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { editarRegrasCopa } from "@/actions/cups"
import { Button } from "@/components/ui/button"
import {
  erroRegras,
  regraParaInput,
  RuleListEditor,
  type OrigemCopa,
  type OrigemPiramide,
  type RegraRascunho,
} from "@/features/cup/components/RuleListEditor"
import type { RegraCopa } from "@/features/cup/data/getCup"

export interface CupRulesPanelProps {
  cupId: string
  /** Regras atuais (resolvidas pelo getCup). */
  regras: RegraCopa[]
  piramides: OrigemPiramide[]
  copas: OrigemCopa[]
}

let seqKey = 0
function regraCopaParaRascunho(r: RegraCopa): RegraRascunho {
  return {
    key: `e${++seqKey}`,
    origemTipo: r.origemTipo,
    origemCompetitionId: r.origemCompetitionId ?? "",
    origemNivel: r.origemNivel ?? 1,
    origemCupId: r.origemCupId ?? "",
    posicaoInicio: r.posicaoInicio,
    posicaoFim: r.posicaoFim,
    prioridade: r.prioridade,
    rotulo: r.rotulo ?? "",
  }
}

/**
 * Painel dono-only para EDITAR o conjunto de regras de qualificação de uma copa.
 * Modo leitura mostra as regras atuais; "Editar" abre o RuleListEditor (mesmo do
 * wizard) e salva via editarRegrasCopa (substitui o conjunto inteiro).
 */
export function CupRulesPanel({ cupId, regras, piramides, copas }: CupRulesPanelProps) {
  const router = useRouter()
  const [editando, setEditando] = React.useState(false)
  const [rascunho, setRascunho] = React.useState<RegraRascunho[]>([])
  const [salvando, startTransition] = React.useTransition()

  function abrirEdicao() {
    setRascunho(regras.map(regraCopaParaRascunho))
    setEditando(true)
  }

  function cancelar() {
    setEditando(false)
  }

  const erro = erroRegras(rascunho, piramides)

  function salvar() {
    if (erro) {
      toast.error(erro)
      return
    }
    startTransition(async () => {
      const r = await editarRegrasCopa(cupId, rascunho.map(regraParaInput))
      if (r.ok) {
        toast.success("Regras atualizadas.")
        setEditando(false)
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function descreverOrigem(r: RegraCopa): string {
    if (r.origemTipo === "divisao") {
      const nome = r.origemNome ?? "Pirâmide"
      return r.origemNivel != null ? `${nome} · nível ${r.origemNivel}` : nome
    }
    return r.origemNome ?? "Copa"
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-3">
        <RuleListEditor
          regras={rascunho}
          setRegras={setRascunho}
          piramides={piramides}
          copas={copas}
        />
        {erro && (
          <p className="text-destructive text-sm" role="alert">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={salvar} disabled={salvando} size="sm" className="rounded-full">
            <Check aria-hidden="true" />
            {salvando ? "Salvando…" : "Salvar regras"}
          </Button>
          <Button
            onClick={cancelar}
            disabled={salvando}
            variant="ghost"
            size="sm"
            className="rounded-full"
          >
            <X aria-hidden="true" />
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {regras.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
          Sem regras de qualificação. Edite para puxar vagas das suas origens.
        </p>
      ) : (
        <ul className="grid list-none gap-2 p-0">
          {regras.map((r) => {
            const numVagas = Math.max(0, r.posicaoFim - r.posicaoInicio + 1)
            return (
              <li
                key={r.id}
                className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {r.rotulo?.trim() || descreverOrigem(r)}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {descreverOrigem(r)} · {r.posicaoInicio}º a {r.posicaoFim}º (
                    {numVagas} {numVagas === 1 ? "vaga" : "vagas"})
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  prio. {r.prioridade}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <Button
        onClick={abrirEdicao}
        variant="outline"
        size="sm"
        className="min-h-10 self-start rounded-full px-4"
      >
        <Pencil aria-hidden="true" />
        Editar regras
      </Button>
    </div>
  )
}
