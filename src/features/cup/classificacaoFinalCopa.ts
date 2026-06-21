/**
 * Motor PURO da CLASSIFICAÇÃO FINAL de uma edição de copa (D11, change
 * add-copas-continentais) — zero IO. A action `encerrarEdicaoCopa` busca as
 * partidas (`match`) da chave + os slots da edição, chama este motor e grava
 * `cup_entries.posicao_final`. Essa classificação alimenta `origem_tipo=copa`
 * (via `classificacao_final_copa`) e a exibição.
 *
 * Lógica NOVA (não reuso direto de `resultadoDaChave`): percorre as partidas da
 * chave reusando os helpers de baixo nível do motor de mata-mata
 * (`decidirConfronto`, `totalFases`, `tamanhoChaveDasPartidas`,
 * `rodadaBaseDaChave`, `ehTerceiroLugar`) para inferir a FASE de eliminação de
 * cada participante e ordena:
 *   campeão = 1, vice = 2, semifinalistas = 3, quartas = 5, oitavas = 9, …
 * (posição estilo competição: empatados na mesma fase dividem a posição-base).
 *
 * Terceiro lugar:
 *   - COM disputa (posicao 2 da fase final): vencedor = 3, perdedor = 4.
 *   - SEM disputa: ambos semifinalistas perdedores empatam em 3 (desempate por
 *     seed só na ORDEM de apresentação; a `posicao_final` é a mesma).
 *
 * Grupos+mata (`grupos_mata_mata`): os eliminados na fase de grupos ficam ABAIXO
 * de todos os da chave, ordenados entre si por colocação agregada na fase de
 * grupos + seed. (Ver TODO: a derivação por grupos depende de `opts.eliminadosGrupos`
 * já ordenado pelo chamador, pois a agregação de grupos é IO-bound/standings.)
 *
 * Determinístico e puro: sem Date.now / Math.random. Desempate final por seed.
 */

import {
  decidirConfronto,
  ehTerceiroLugar,
  rodadaBaseDaChave,
  tamanhoChaveDasPartidas,
  totalFases,
  type PartidaJogada,
  type ResultadoConfronto,
} from "@/features/knockout/gerarChaveMataMata"

import { identidadeDe } from "@/features/cup/derivacao"

import type { IdentidadeParticipante } from "@/features/cup/types"

/**
 * Recorte mínimo de um slot da edição: o `id` opaco (= `slot_id`, usado em
 * `match.participante_1/2`), o `seed` (ordem de seeding) e a identidade
 * (team_id XOR rotulo). Filosofia "recorte mínimo" (como `PartidaClassificavel`):
 * independe do shape exato do fetch.
 */
export interface SlotEdicao {
  /** Id opaco do participante na chave (= tournament_slots.id). */
  id: string
  /** Seed 1-based (ordem de seeding; menor = mais forte). Desempate final. */
  seed: number
  team_id: string | null
  rotulo: string | null
}

export interface OpcoesClassificacaoFinal {
  /** Houve disputa de 3º lugar configurada (posicao 2 da fase final). */
  terceiroLugar: boolean
  /**
   * Eliminados na FASE DE GRUPOS (grupos_mata_mata), JÁ ordenados pelo chamador
   * por colocação agregada + seed (melhor primeiro). Vazio/ausente em mata-mata
   * puro. Cada id é um `slot.id`. Eles recebem posições contíguas APÓS o último
   * colocado da chave.
   */
  eliminadosGruposOrdenados?: string[]
}

/** Uma linha da classificação final: identidade do participante + posição. */
export interface LinhaClassificacaoFinal {
  identidade: IdentidadeParticipante
  /** Id opaco do slot (rastreabilidade para a action gravar posicao_final). */
  slotId: string
  posicao_final: number
}

/** Partida da chave com rodada/posição definidas (já filtrada). */
type PartidaChaveGerada = PartidaJogada & { rodada: number; posicao: number }

/**
 * Computa a classificação final da chave de uma edição encerrada.
 *
 * @param partidas - partidas (`match`) da chave (formato `PartidaJogada`). Em
 *   grupos_mata_mata, passe SÓ as partidas do mata-mata (as de grupos não têm
 *   `posicao` de slot de chave e são naturalmente ignoradas pelo filtro).
 * @param slots - slots da edição (id opaco + seed + identidade).
 * @param opts - terceiroLugar + eliminados de grupos pré-ordenados.
 */
export function lerClassificacaoFinalCopa(
  partidas: PartidaJogada[],
  slots: SlotEdicao[],
  opts: OpcoesClassificacaoFinal
): LinhaClassificacaoFinal[] {
  const porSlotId = new Map<string, SlotEdicao>()
  for (const s of slots) porSlotId.set(s.id, s)

  const seedDe = (slotId: string): number => porSlotId.get(slotId)?.seed ?? Number.MAX_SAFE_INTEGER

  // Partidas da chave: rodada/posicao definidas.
  const geradas = partidas.filter(
    (p): p is PartidaChaveGerada => p.rodada !== null && p.posicao !== null
  )

  // Sem chave gerada: nada a classificar a partir do mata-mata (pode haver só
  // eliminados de grupos — tratados no fim).
  const resultado: LinhaClassificacaoFinal[] = []
  if (geradas.length === 0) {
    return anexarEliminadosGrupos(resultado, opts.eliminadosGruposOrdenados ?? [], porSlotId)
  }

  const base = rodadaBaseDaChave(geradas)
  const s = tamanhoChaveDasPartidas(geradas)
  const fases = totalFases(s)

  /**
   * Para cada fase relativa `f` (1..fases), agrupa as partidas REGULARES (exclui
   * o 3º lugar) por slot e decide cada confronto. Devolve, por slot, o resultado
   * (vencedor/perdedor) — null se algum confronto está em aberto (chave não
   * encerrada; defensivo, a action só encerra com torneio encerrado).
   */
  const resultadosDaFase = (f: number): ResultadoConfronto[] | null => {
    const slotsEsperados = s / 2 ** f
    const porSlot = new Map<number, PartidaChaveGerada[]>()
    for (const p of geradas) {
      if (p.rodada - base + 1 !== f) continue
      if (ehTerceiroLugar(f, p.posicao, fases)) continue
      const lista = porSlot.get(p.posicao) ?? []
      lista.push(p)
      porSlot.set(p.posicao, lista)
    }
    const out: ResultadoConfronto[] = []
    for (let slot = 1; slot <= slotsEsperados; slot++) {
      const doSlot = porSlot.get(slot)
      if (!doSlot) return null
      const r = decidirConfronto(doSlot)
      if (!r) return null
      out.push(r)
    }
    return out
  }

  // Posição-base de quem é ELIMINADO na fase relativa `f`: o nº de
  // sobreviventes ANTES dessa fase + 1. Sobreviventes que entram na fase `f` =
  // 2^(fases-f+1) (dois por confronto); os eliminados ali ocupam a metade de baixo.
  // Final (f=fases): entram 2 → vice ocupa posição 2. Semis (f=fases-1): entram 4
  // → eliminados em 3. Quartas: entram 8 → eliminados em 5. Etc.
  const posicaoBaseEliminadoNaFase = (f: number): number => 2 ** (fases - f) + 1

  // Decide a FINAL para extrair campeão (1) e vice (2).
  const final = resultadosDaFase(fases)
  if (final && final.length === 1 && final[0].perdedor !== null) {
    pushLinha(resultado, final[0].vencedor, 1, porSlotId)
    pushLinha(resultado, final[0].perdedor, 2, porSlotId)
  } else if (final && final.length === 1 && final[0].perdedor === null) {
    // Final com bye (chave de 2 com N efetivo... não ocorre em copa válida, mas
    // defensivo): só campeão.
    pushLinha(resultado, final[0].vencedor, 1, porSlotId)
  }

  // 3º lugar: COM disputa explícita (posicao 2 da fase final) → vencedor 3, perdedor 4.
  // SEM disputa → ambos perdedores das semis empatam em 3 (desempate por seed na ordem).
  const eliminadosTerceiro = new Set<string>()
  const partidaTerceiro = geradas.filter(
    (p) => ehTerceiroLugar(p.rodada - base + 1, p.posicao, fases)
  )
  const temDisputaTerceiro =
    opts.terceiroLugar && partidaTerceiro.length > 0
  if (fases >= 2) {
    const semis = resultadosDaFase(fases - 1)
    if (semis) {
      const perdedoresSemi = semis
        .map((r) => r.perdedor)
        .filter((p): p is string => p !== null)
      if (temDisputaTerceiro) {
        const resTerceiro = decidirConfronto(partidaTerceiro)
        if (resTerceiro && resTerceiro.perdedor !== null) {
          pushLinha(resultado, resTerceiro.vencedor, 3, porSlotId)
          pushLinha(resultado, resTerceiro.perdedor, 4, porSlotId)
          eliminadosTerceiro.add(resTerceiro.vencedor)
          eliminadosTerceiro.add(resTerceiro.perdedor)
        }
      }
      if (!temDisputaTerceiro || eliminadosTerceiro.size === 0) {
        // Sem disputa (ou disputa indecidível): ambos semifinalistas empatam em 3.
        // Ordem de apresentação por seed (asc); a posicao_final é a mesma (3).
        const ordenados = [...perdedoresSemi].sort((a, b) => seedDe(a) - seedDe(b))
        for (const id of ordenados) {
          pushLinha(resultado, id, 3, porSlotId)
        }
      }
    }
  }

  // Demais fases (quartas para trás): eliminados na fase `f` (1 <= f <= fases-2)
  // empatam na posição-base da fase; ordem de apresentação por seed.
  for (let f = fases - 2; f >= 1; f--) {
    const res = resultadosDaFase(f)
    if (!res) continue
    const posicaoBase = posicaoBaseEliminadoNaFase(f)
    const perdedores = res
      .map((r) => r.perdedor)
      .filter((p): p is string => p !== null)
      .sort((a, b) => seedDe(a) - seedDe(b))
    for (const id of perdedores) {
      pushLinha(resultado, id, posicaoBase, porSlotId)
    }
  }

  // Eliminados de grupos: abaixo de todos os da chave.
  return anexarEliminadosGrupos(
    resultado,
    opts.eliminadosGruposOrdenados ?? [],
    porSlotId
  )
}

/** Acrescenta uma linha resolvendo a identidade do slot (ignora slot ausente). */
function pushLinha(
  acc: LinhaClassificacaoFinal[],
  slotId: string,
  posicao_final: number,
  porSlotId: Map<string, SlotEdicao>
): void {
  const slot = porSlotId.get(slotId)
  if (!slot) return // id opaco sem slot conhecido (defensivo)
  acc.push({
    identidade: identidadeDe(slot.team_id, slot.rotulo),
    slotId,
    posicao_final,
  })
}

/**
 * Anexa os eliminados da fase de grupos APÓS o último colocado da chave. Recebem
 * posições CONTÍGUAS começando em (maior posicao_final da chave + 1), na ordem já
 * fornecida (colocação agregada + seed, computada pelo chamador). Cada um recebe
 * uma posição distinta (sem empate entre eles — a ordem já os separou).
 */
function anexarEliminadosGrupos(
  daChave: LinhaClassificacaoFinal[],
  eliminadosOrdenados: string[],
  porSlotId: Map<string, SlotEdicao>
): LinhaClassificacaoFinal[] {
  if (eliminadosOrdenados.length === 0) return daChave
  const maxPosicao = daChave.reduce((m, l) => Math.max(m, l.posicao_final), 0)
  const resultado = [...daChave]
  let pos = maxPosicao + 1
  for (const slotId of eliminadosOrdenados) {
    const slot = porSlotId.get(slotId)
    if (!slot) continue
    resultado.push({
      identidade: identidadeDe(slot.team_id, slot.rotulo),
      slotId,
      posicao_final: pos,
    })
    pos += 1
  }
  return resultado
}
