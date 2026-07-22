"use client"

import { Layers, Plus, X } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNative } from "@/components/ui/select-native"
import { cn } from "@/lib/utils"
import type { CupRuleInput } from "@/schema/cupSchema"

/** Uma pirâmide do dono ofertada como origem (com seus níveis). */
export interface OrigemPiramide {
  id: string
  nome: string
  /** Nº de divisões (níveis 1..numNiveis) da temporada corrente. */
  numNiveis: number
}

/** Uma copa do dono ofertada como origem. */
export interface OrigemCopa {
  id: string
  nome: string
}

/** Origem de uma regra em construção. `divisao_todos` = divisão inteira sem faixa. */
export type OrigemTipoRascunho = "divisao" | "divisao_todos" | "copa"

/** Uma regra em construção (espelha cupRuleSchema, com chave estável de lista). */
export interface RegraRascunho {
  key: string
  origemTipo: OrigemTipoRascunho
  origemCompetitionId: string
  origemNivel: number
  origemCupId: string
  posicaoInicio: number
  posicaoFim: number
  prioridade: number
  rotulo: string
}

let regraSeq = 0

/** Cria uma regra nova com defaults coerentes com as origens disponíveis. */
export function novaRegra(
  piramides: OrigemPiramide[],
  copas: OrigemCopa[]
): RegraRascunho {
  const temPiramide = piramides.length > 0
  return {
    key: `r${++regraSeq}`,
    origemTipo: temPiramide ? "divisao" : "copa",
    origemCompetitionId: temPiramide ? piramides[0].id : "",
    origemNivel: 1,
    origemCupId: copas[0]?.id ?? "",
    posicaoInicio: 1,
    posicaoFim: 4,
    prioridade: 0,
    rotulo: "",
  }
}

/** Converte uma regra em construção para o input da action (XOR por tipo). */
export function regraParaInput(r: RegraRascunho): CupRuleInput {
  if (r.origemTipo === "copa") {
    return {
      origemTipo: "copa",
      origemCupId: r.origemCupId,
      posicaoInicio: r.posicaoInicio,
      posicaoFim: r.posicaoFim,
      prioridade: r.prioridade,
      rotulo: r.rotulo.trim() || undefined,
    }
  }
  if (r.origemTipo === "divisao_todos") {
    // Divisão inteira: sem faixa (o backend grava posições nulas).
    return {
      origemTipo: "divisao_todos",
      origemCompetitionId: r.origemCompetitionId,
      origemNivel: r.origemNivel,
      prioridade: r.prioridade,
      rotulo: r.rotulo.trim() || undefined,
    }
  }
  return {
    origemTipo: "divisao",
    origemCompetitionId: r.origemCompetitionId,
    origemNivel: r.origemNivel,
    posicaoInicio: r.posicaoInicio,
    posicaoFim: r.posicaoFim,
    prioridade: r.prioridade,
    rotulo: r.rotulo.trim() || undefined,
  }
}

/** Validação leve (o backend revalida): null = ok. */
export function erroRegras(
  regras: RegraRascunho[],
  piramides: OrigemPiramide[]
): string | null {
  for (const r of regras) {
    const ehDivisao = r.origemTipo === "divisao" || r.origemTipo === "divisao_todos"
    if (ehDivisao) {
      if (!r.origemCompetitionId) return "Escolha a pirâmide de origem em todas as regras."
      const p = piramides.find((x) => x.id === r.origemCompetitionId)
      if (p && (r.origemNivel < 1 || r.origemNivel > p.numNiveis)) {
        return `O nível ${r.origemNivel} não existe em ${p.nome} (1–${p.numNiveis}).`
      }
    } else if (!r.origemCupId) {
      return "Escolha a copa de origem em todas as regras."
    }
    // A faixa não se aplica a `divisao_todos` (divisão inteira).
    if (r.origemTipo !== "divisao_todos" && r.posicaoFim < r.posicaoInicio) {
      return "A posição final deve ser maior ou igual à inicial em todas as regras."
    }
  }
  return null
}

/**
 * Editor de uma LISTA de regras de qualificação — compartilhado pelo CupWizard
 * (passo 2) e pelo painel de regras da página da copa. Estado é controlado pelo
 * pai (regras + setRegras). Não submete; só edita.
 */
export function RuleListEditor({
  regras,
  setRegras,
  piramides,
  copas,
}: {
  regras: RegraRascunho[]
  setRegras: React.Dispatch<React.SetStateAction<RegraRascunho[]>>
  piramides: OrigemPiramide[]
  copas: OrigemCopa[]
}) {
  const semOrigem = piramides.length === 0 && copas.length === 0

  function adicionar() {
    setRegras((atual) => [...atual, novaRegra(piramides, copas)])
  }
  function atualizar(idx: number, patch: Partial<RegraRascunho>) {
    setRegras((atual) => atual.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function remover(idx: number) {
    setRegras((atual) => atual.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-3">
      {semOrigem ? (
        <div className="bg-muted/10 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
          <Layers className="text-primary/70 mx-auto mb-3 size-7" aria-hidden="true" />
          Você ainda não tem nenhuma pirâmide ou copa para servir de origem.
        </div>
      ) : regras.length === 0 ? (
        <div className="bg-muted/10 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
          Nenhuma regra ainda.
        </div>
      ) : (
        <ul className="grid list-none gap-2.5 p-0">
          {regras.map((r, idx) => (
            <CartaoRegra
              key={r.key}
              r={r}
              idx={idx}
              piramides={piramides}
              copas={copas}
              onAtualizar={atualizar}
              onRemover={remover}
            />
          ))}
        </ul>
      )}

      {!semOrigem && (
        <Button type="button" variant="outline" onClick={adicionar} className="rounded-full">
          <Plus aria-hidden="true" />
          Adicionar regra
        </Button>
      )}
    </div>
  )
}

function CartaoRegra({
  r,
  idx,
  piramides,
  copas,
  onAtualizar,
  onRemover,
}: {
  r: RegraRascunho
  idx: number
  piramides: OrigemPiramide[]
  copas: OrigemCopa[]
  onAtualizar: (idx: number, patch: Partial<RegraRascunho>) => void
  onRemover: (idx: number) => void
}) {
  const piramide = piramides.find((p) => p.id === r.origemCompetitionId)
  const niveis = piramide ? piramide.numNiveis : 1
  const faixaInvalida = r.posicaoFim < r.posicaoInicio
  const numVagas = Math.max(0, r.posicaoFim - r.posicaoInicio + 1)
  const podeDivisao = piramides.length > 0
  const podeCopa = copas.length > 0
  const ehDivisao = r.origemTipo === "divisao" || r.origemTipo === "divisao_todos"
  // `divisao_todos` leva a divisão inteira da temporada corrente: sem faixa.
  const ehTodos = r.origemTipo === "divisao_todos"

  return (
    <li className="bg-card/60 flex flex-col gap-3 rounded-xl border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Regra {idx + 1}</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => onRemover(idx)}
          aria-label={`Remover regra ${idx + 1}`}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`r-tipo-${r.key}`} className="text-xs">
          Origem
        </Label>
        <SelectNative
          id={`r-tipo-${r.key}`}
          value={r.origemTipo}
          onChange={(e) =>
            onAtualizar(idx, { origemTipo: e.target.value as OrigemTipoRascunho })
          }
          className="md:h-9"
        >
          {podeDivisao && <option value="divisao">Divisão de uma pirâmide (por faixa)</option>}
          {podeDivisao && (
            <option value="divisao_todos">Todos os clubes da divisão</option>
          )}
          {podeCopa && <option value="copa">Resultado de outra copa</option>}
        </SelectNative>
      </div>

      {ehDivisao ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`r-pir-${r.key}`} className="text-xs">
              Pirâmide
            </Label>
            <SelectNative
              id={`r-pir-${r.key}`}
              value={r.origemCompetitionId}
              onChange={(e) =>
                onAtualizar(idx, { origemCompetitionId: e.target.value, origemNivel: 1 })
              }
              className="md:h-9"
            >
              {piramides.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`r-niv-${r.key}`} className="text-xs">
              Nível (divisão)
            </Label>
            <SelectNative
              id={`r-niv-${r.key}`}
              value={r.origemNivel}
              onChange={(e) => onAtualizar(idx, { origemNivel: Number(e.target.value) })}
              className="md:h-9"
            >
              {Array.from({ length: niveis }, (_, i) => i + 1).map((nivel) => (
                <option key={nivel} value={nivel}>
                  Nível {nivel}
                </option>
              ))}
            </SelectNative>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor={`r-copa-${r.key}`} className="text-xs">
            Copa de origem
          </Label>
          <SelectNative
            id={`r-copa-${r.key}`}
            value={r.origemCupId}
            onChange={(e) => onAtualizar(idx, { origemCupId: e.target.value })}
            className="md:h-9"
          >
            {copas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </SelectNative>
        </div>
      )}

      <div
        className={cn(
          "grid gap-3",
          ehTodos ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"
        )}
      >
        {!ehTodos && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor={`r-ini-${r.key}`} className="text-xs">
                Da posição
              </Label>
              <Input
                id={`r-ini-${r.key}`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={r.posicaoInicio}
                onChange={(e) =>
                  onAtualizar(idx, {
                    posicaoInicio: Math.max(1, Math.round(Number(e.target.value) || 1)),
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`r-fim-${r.key}`} className="text-xs">
                Até a posição
              </Label>
              <Input
                id={`r-fim-${r.key}`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={r.posicaoFim}
                onChange={(e) =>
                  onAtualizar(idx, {
                    posicaoFim: Math.max(1, Math.round(Number(e.target.value) || 1)),
                  })
                }
              />
            </div>
          </>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`r-pri-${r.key}`} className="text-xs">
            Prioridade
          </Label>
          <Input
            id={`r-pri-${r.key}`}
            type="number"
            inputMode="numeric"
            step={1}
            value={r.prioridade}
            onChange={(e) =>
              onAtualizar(idx, { prioridade: Math.round(Number(e.target.value) || 0) })
            }
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`r-rot-${r.key}`} className="text-xs">
          Rótulo da vaga (opcional)
        </Label>
        <Input
          id={`r-rot-${r.key}`}
          autoComplete="off"
          placeholder="Ex.: Classificados da Série A"
          value={r.rotulo}
          maxLength={80}
          onChange={(e) => onAtualizar(idx, { rotulo: e.target.value })}
        />
      </div>

      {ehTodos ? (
        <p className="text-muted-foreground text-[0.7rem]">
          Leva TODOS os clubes desta divisão na temporada em disputa (sem faixa, sem
          esperar o encerramento). Re-derive para repegar os técnicos atuais.
        </p>
      ) : faixaInvalida ? (
        <p className="text-destructive text-xs" role="alert">
          A posição final deve ser maior ou igual à inicial.
        </p>
      ) : (
        <p className="text-muted-foreground text-[0.7rem]">
          {numVagas} {numVagas === 1 ? "vaga" : "vagas"} (posições {r.posicaoInicio} a{" "}
          {r.posicaoFim} da classificação final — exige a temporada/edição encerrada).
        </p>
      )}
    </li>
  )
}
