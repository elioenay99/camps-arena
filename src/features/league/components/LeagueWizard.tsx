"use client"

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  Plus,
  Trophy,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { createCompetition } from "@/actions/leaguePyramid"
import { selectTeam } from "@/actions/teams"
import { Button } from "@/components/ui/button"
import { ColorField } from "@/components/ui/color-field"
import {
  GRUPOS_VALIDOS,
  validarGeometria,
} from "@/features/groups/gerarFaseDeGrupos"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Termo } from "@/features/glossario/Termo"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"
import { previaLiga } from "@/features/league/gerarTabelaLiga"
import { cn } from "@/lib/utils"
import type { TeamResult } from "@/schema/teamSchema"
import {
  DESEMPATES_DISPONIVEIS,
  DIVISAO_MAX_TAMANHO,
  DIVISAO_MIN_TAMANHO,
  ehPotenciaDe2,
  MAX_DIVISOES,
  movimentoEfetivo,
  PIRAMIDE_PRESETS,
  PLAYOFF_VAGAS_COMPLETAS,
  PRESET_PERSONALIZADO,
  RANKING_BASES_DISPONIVEIS,
  type CreateCompetitionInput,
  type PiramidePresetId,
} from "@/schema/leaguePyramidSchema"

/* -------------------------------------------------------------------------- */
/* Modelo de estado do cliente (espelha o schema, mas mutável passo-a-passo)  */
/* -------------------------------------------------------------------------- */

/** Competidor no modo CLUBE — `teamId` é o id LOCAL (de `selectTeam`). */
interface ClubeRascunho {
  tipo: "clube"
  teamId: string
  nome: string
  escudo?: string
  externalId: string
}

/** Competidor no modo NOME — rótulo livre. */
interface NomeRascunho {
  tipo: "nome"
  rotulo: string
}

type CompetidorRascunho = ClubeRascunho | NomeRascunho

/** Uma divisão em construção. `nivel` = 1 (topo) … N. */
interface DivisaoRascunho {
  nivel: number
  nome: string
  porNome: boolean
  desempate: (typeof DESEMPATES_DISPONIVEIS)[number]
  rankingBase: (typeof RANKING_BASES_DISPONIVEIS)[number]
  /** Fase 5.2: formato interno (liga | grupos+mata-mata). */
  formato: "liga" | "grupos_mata_mata"
  /** Turno da divisão de liga (change add-ida-volta-divisao): false = turno único;
   * true = ida e volta. Só vale em formato 'liga'. */
  idaEVolta: boolean
  /** Geometria de grupos (só em grupos_mata_mata). */
  qtdGrupos?: number
  classificadosPorGrupo?: number
  tamanho: number
  /** Cores PRÓPRIAS da divisão (change add-cores-campeonato): vazias herdam a
   * cor da pirâmide. Strings controladas; o submit envia hex ou undefined. */
  corPrimaria: string
  corSecundaria: string
  competidores: CompetidorRascunho[]
}

/** Modo de uma fronteira (espelha MODOS_FRONTEIRA do schema). */
type ModoFronteira = "direto" | "playoff_acesso" | "playout" | "barragem_cruzada"
/** Estilo de resolução de um playoff (espelha PLAYOFF_ESTILOS do schema). */
type EstiloPlayoff = "vagas" | "extra"
/** Estilo de uma barragem cruzada (espelha BARRAGEM_ESTILOS do schema). */
type EstiloBarragem = "pares" | "chave"
/** Estilo de QUALQUER fronteira não-direto (playoff ∪ barragem; ESTILOS_FRONTEIRA). */
type EstiloFronteira = EstiloPlayoff | EstiloBarragem

/**
 * Uma fronteira entre `nivelSuperior` (d) e d+1. Na Fase 2 a fronteira pode
 * resolver o sobe/cai por uma CHAVE de mata-mata (`playoff_acesso`/`playout`),
 * além do corte direto pela tabela (`direto`). Os campos de playoff só importam
 * quando `modo !== "direto"`; em "direto" ficam `undefined`/default.
 */
interface FronteiraRascunho {
  nivelSuperior: number
  vagasAcesso: number
  vagasRebaixamento: number
  modo: ModoFronteira
  /**
   * Estilo da fronteira não-direto — playoff (vagas/extra) OU barragem
   * (pares/chave). Só definido quando modo !== "direto".
   */
  playoffEstilo?: EstiloFronteira
  /** Chave em ida-e-volta (final sempre jogo único). Default false. */
  playoffIdaEVolta: boolean
  /** Tamanho da chave (2..32) — só definido quando modo !== "direto". */
  playoffVagas?: number
}

const PASSOS = ["preset", "divisoes", "fronteiras", "competidores"] as const
type Passo = (typeof PASSOS)[number]

const ROTULO_PASSO: Record<Passo, string> = {
  preset: "Formato",
  divisoes: "Divisões",
  fronteiras: "Acesso e queda",
  competidores: "Competidores",
}

const DESEMPATE_ROTULO: Record<(typeof DESEMPATES_DISPONIVEIS)[number], string> = {
  cbf: "CBF (vitórias, saldo, gols pró)",
  ingles: "Inglês (saldo, gols pró, vitórias)",
  espanhol: "Espanhol (confronto entre empatados, depois saldo)",
  fifa: "FIFA (saldo, gols pró, depois confronto)",
}

/** Rótulo da base de ranking de sobe/cai por divisão (Fase 4). */
const RANKING_BASE_ROTULO: Record<(typeof RANKING_BASES_DISPONIVEIS)[number], string> = {
  posicao: "Posição (tabela do ano)",
  promedios: "Promédio (média plurianual)",
}

/** Classe compartilhada dos <select> nativos do wizard (espelha o de desempate). */
const SELECT_CLASSE =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"

/** Rótulo do formato interno por divisão (Fase 5.2). */
const FORMATO_ROTULO: Record<DivisaoRascunho["formato"], string> = {
  liga: "Liga (pontos corridos)",
  grupos_mata_mata: "Grupos + mata-mata",
}

/* -------------------------------------------------------------------------- */
/* Geometria de grupos por divisão — só oferecemos combinações VÁLIDAS         */
/* (espelha validarGeometria do motor; o backend revalida de verdade)          */
/* -------------------------------------------------------------------------- */

/**
 * Testa a geometria (tamanho, qtdGrupos, K) reusando a fonte de verdade do
 * motor: `validarGeometria` lança Error com a mensagem amigável quando a chave
 * não fecha. Devolve a mensagem (string) se inválida, ou null se ok.
 */
function erroGeometria(
  tamanho: number,
  qtdGrupos: number,
  classificadosPorGrupo: number
): string | null {
  try {
    validarGeometria(tamanho, qtdGrupos, classificadosPorGrupo)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : "Configuração de grupos inválida."
  }
}

/**
 * Quantidades de grupos viáveis para um `tamanho` (≥ 2 por grupo). Reusa
 * GRUPOS_VALIDOS do motor, EXCLUI o grupo único (1) — a divisão só oferece
 * grupos+mata-mata de verdade (G ≥ 2) — e mantém apenas os que comportam ao
 * menos uma combinação de K que feche a chave.
 */
function gruposValidosPara(tamanho: number): number[] {
  return GRUPOS_VALIDOS.filter(
    (g) => g >= 2 && classificadosValidosPara(tamanho, g).length > 0
  )
}

/**
 * Classificados por grupo viáveis para (tamanho, qtdGrupos): varre os K que o
 * total possível admite (K < piso(tamanho/qtdGrupos)) e mantém só os que passam
 * em `validarGeometria` (total ∈ chave completa + K cabe no menor grupo).
 */
function classificadosValidosPara(tamanho: number, qtdGrupos: number): number[] {
  const menorGrupo = Math.floor(tamanho / qtdGrupos)
  const out: number[] = []
  for (let k = 1; k < menorGrupo; k++) {
    if (erroGeometria(tamanho, qtdGrupos, k) === null) out.push(k)
  }
  return out
}

/**
 * Primeira combinação válida para um `tamanho`, semeada ao trocar para
 * grupos+mata-mata: menor nº de grupos viável e o MAIOR K válido para ele
 * (chave mais cheia). Retorna null se o tamanho não comporta grupos+mata-mata.
 */
function defaultGeometria(
  tamanho: number
): { qtdGrupos: number; classificadosPorGrupo: number } | null {
  const grupos = gruposValidosPara(tamanho)
  for (const g of grupos) {
    const ks = classificadosValidosPara(tamanho, g)
    if (ks.length > 0) {
      return { qtdGrupos: g, classificadosPorGrupo: ks[ks.length - 1] }
    }
  }
  return null
}

const MODO_ROTULO: Record<ModoFronteira, string> = {
  direto: "Direto (pela tabela)",
  playoff_acesso: "Playoff de acesso",
  playout: "Playout (queda)",
  barragem_cruzada: "Barragem cruzada",
}

/** Nome amigável de uma divisão por nível, quando o dono não nomeou. */
function nomePadraoDivisao(nivel: number): string {
  return `Divisão ${nivel}`
}

/* -------------------------------------------------------------------------- */
/* Presets → esqueleto inicial de divisões/fronteiras                          */
/* -------------------------------------------------------------------------- */

/**
 * Hidrata o rascunho a partir de um preset. Os presets só carregam o esqueleto
 * sobe/cai e o desempate; começamos com 2 divisões de 20 (o caso clássico) —
 * o dono ajusta nomes/tamanhos no passo seguinte. "Personalizado" começa com
 * uma única divisão e sem fronteiras.
 */
function hidratarPreset(preset: PiramidePresetId): {
  divisoes: DivisaoRascunho[]
  fronteiras: FronteiraRascunho[]
} {
  if (preset === PRESET_PERSONALIZADO) {
    return {
      divisoes: [novaDivisao(1, "cbf")],
      fronteiras: [],
    }
  }

  const meta = PIRAMIDE_PRESETS[preset]
  const divisoes = [novaDivisao(1, meta.desempate), novaDivisao(2, meta.desempate)]
  const fronteiras: FronteiraRascunho[] = [
    novaFronteira(1, meta.vagasPorFronteira),
  ]
  return { divisoes, fronteiras }
}

function novaDivisao(
  nivel: number,
  desempate: (typeof DESEMPATES_DISPONIVEIS)[number]
): DivisaoRascunho {
  return {
    nivel,
    nome: nomePadraoDivisao(nivel),
    porNome: false,
    desempate,
    rankingBase: "posicao",
    formato: "liga",
    idaEVolta: false,
    tamanho: 20,
    corPrimaria: "",
    corSecundaria: "",
    competidores: [],
  }
}

/**
 * Fronteira nova com defaults explícitos da Fase 2: modo "direto" (sem playoff),
 * leg jogo único. `playoffEstilo`/`playoffVagas` ficam `undefined` enquanto o
 * modo for "direto" (o schema rejeita estilo/vagas numa fronteira direta).
 */
function novaFronteira(nivelSuperior: number, vagas: number): FronteiraRascunho {
  return {
    nivelSuperior,
    vagasAcesso: vagas,
    vagasRebaixamento: vagas,
    modo: "direto",
    playoffEstilo: undefined,
    playoffIdaEVolta: false,
    playoffVagas: undefined,
  }
}

/**
 * Patch de uma fronteira ao TROCAR de modo/estilo, mantendo o resto coerente.
 * "direto" zera os campos de playoff (o schema os rejeita aí). Ao virar playoff,
 * semeia estilo "vagas" + chave 4 (combinação completa válida) se ainda não havia.
 * "extra" DERIVA o lado dependente (acesso ⇒ rebaix=acesso+1; playout ⇒
 * acesso=rebaix+1); "vagas" volta à simetria bruta.
 */
function patchModoFronteira(
  f: FronteiraRascunho,
  modo: ModoFronteira
): Partial<FronteiraRascunho> {
  if (modo === "direto") {
    return {
      modo,
      playoffEstilo: undefined,
      playoffVagas: undefined,
      // Volta à simetria bruta sem o derivado do 'extra'.
      vagasRebaixamento: f.vagasAcesso,
    }
  }
  // Barragem cruzada: AUTO-BALANCEADA → diretos sempre simétricos. Semeia o
  // estilo 'pares' com pv=2 (B=1 confronto 1×1), preservando o nº de diretos do
  // lado de acesso (que vira o número simétrico de sobe/cai diretos).
  if (modo === "barragem_cruzada") {
    const diretos = Math.max(0, f.vagasAcesso)
    return {
      modo,
      playoffEstilo: "pares",
      playoffVagas: 2,
      vagasAcesso: diretos,
      vagasRebaixamento: diretos,
    }
  }
  // Vira playoff: SEMEAR uma combinação VÁLIDA (sem beco-sem-saída). Preserva o
  // movimento N do lado favorável (acesso no acesso; queda no playout): se N é
  // potência de 2, usa 'vagas' com chave 2N (a chave decide as N vagas); senão
  // 'extra' com N-1 diretos + 1 campeão (mesmo movimento N).
  const N = modo === "playout" ? f.vagasRebaixamento : f.vagasAcesso
  const chave2N = N * 2
  if (
    ehPotenciaDe2(N) &&
    N >= 1 &&
    (PLAYOFF_VAGAS_COMPLETAS as readonly number[]).includes(chave2N)
  ) {
    return {
      modo,
      playoffEstilo: "vagas",
      playoffVagas: chave2N,
      vagasAcesso: N,
      vagasRebaixamento: N,
    }
  }
  // 'extra' preservando o movimento N: N-1 diretos + 1 pela chave (sobeEf/caiEf = N).
  const direto = Math.max(0, N - 1)
  if (modo === "playoff_acesso") {
    return {
      modo,
      playoffEstilo: "extra",
      playoffVagas: 4,
      vagasAcesso: direto,
      vagasRebaixamento: direto + 1,
    }
  }
  return {
    modo,
    playoffEstilo: "extra",
    playoffVagas: 4,
    vagasAcesso: direto + 1,
    vagasRebaixamento: direto,
  }
}

/**
 * Recalcula vagas brutas conforme o estilo escolhido, mantendo o lado que o
 * usuário controla e DERIVANDO o dependente (regra do 'extra', design §8.3).
 * No 'vagas' GARANTE uma combinação válida (chave completa + nº favorável
 * potência de 2 < chave) — clampa em vez de produzir config inválida. Na
 * barragem ('pares'/'chave') os diretos são SEMPRE simétricos; só normaliza o
 * tamanho da chave ao formato exigido por cada estilo (par vs. potência de 2).
 */
function aplicarEstiloFronteira(
  f: FronteiraRascunho,
  estilo: EstiloFronteira
): Partial<FronteiraRascunho> {
  const base: Partial<FronteiraRascunho> = { playoffEstilo: estilo, modo: f.modo }
  if (estilo === "pares") {
    // pv PAR (2B confrontos 1×1). Se o atual não serve, usa 2 (B=1). Diretos
    // simétricos preservados (a barragem é auto-balanceada nos diretos).
    const pv = f.playoffVagas && f.playoffVagas >= 2 && f.playoffVagas % 2 === 0
      ? f.playoffVagas
      : 2
    return { ...base, playoffVagas: pv, vagasAcesso: f.vagasAcesso, vagasRebaixamento: f.vagasAcesso }
  }
  if (estilo === "chave") {
    // pv potência de 2 ∈ {4,8,16,32} (1 defensor + k desafiantes). Diretos simétricos.
    const pv = (PLAYOFF_VAGAS_COMPLETAS as readonly number[]).includes(f.playoffVagas ?? 0)
      ? (f.playoffVagas as number)
      : 4
    return { ...base, playoffVagas: pv, vagasAcesso: f.vagasAcesso, vagasRebaixamento: f.vagasAcesso }
  }
  if (estilo === "vagas") {
    // 'vagas' exige chave COMPLETA (4/8/16/32). Se vinha de 'extra' com chave 2,
    // normaliza para a menor completa que mostre uma opção válida.
    const playoffVagas = (PLAYOFF_VAGAS_COMPLETAS as readonly number[]).includes(
      f.playoffVagas ?? 0
    )
      ? (f.playoffVagas as number)
      : 8
    // Nº favorável VÁLIDO: potência de 2 ESTRITAMENTE < chave. Acesso usa
    // vagasAcesso direto; playout usa o nº de quedas (sobreviventes = chave - v).
    // O default chave/2 vale para AMBOS (acesso: chave/2 pot2 < chave; playout:
    // sobreviventes = chave/2 pot2). Preserva o lado atual se já válido.
    const atual = f.modo === "playout" ? f.vagasRebaixamento : f.vagasAcesso
    const v =
      ehPotenciaDe2(atual) && atual > 0 && atual < playoffVagas
        ? atual
        : playoffVagas / 2
    return { ...base, playoffVagas, vagasAcesso: v, vagasRebaixamento: v }
  }
  // extra: o +1 é de UM lado; deriva o dependente. Garante chave válida [2,32].
  const playoffVagas = f.playoffVagas && f.playoffVagas >= 2 ? f.playoffVagas : 4
  if (f.modo === "playoff_acesso") {
    return { ...base, playoffVagas, vagasRebaixamento: f.vagasAcesso + 1 }
  }
  return { ...base, playoffVagas, vagasAcesso: f.vagasRebaixamento + 1 }
}

/* -------------------------------------------------------------------------- */
/* Validação leve no cliente (espelha o schema; a action revalida de verdade)  */
/* -------------------------------------------------------------------------- */

/** Tamanho de cada divisão APÓS o sobe/cai (conservação — design §7.1). */
function tamanhoFinal(
  divisoes: DivisaoRascunho[],
  fronteiras: FronteiraRascunho[]
): Map<number, number> {
  const sobe = new Map<number, number>()
  const cai = new Map<number, number>()
  const recebeDeCima = new Map<number, number>()
  const recebeDeBaixo = new Map<number, number>()

  for (const f of fronteiras) {
    const sup = f.nivelSuperior
    const inf = sup + 1
    // Conservação sobre os EFETIVOS (o +1 do estilo 'extra' é de UM lado só).
    // Fonte única: movimentoEfetivo do schema — NÃO recalcular aqui.
    const { sobeEf, caiEf } = movimentoEfetivo(f)
    cai.set(sup, (cai.get(sup) ?? 0) + caiEf)
    recebeDeCima.set(inf, (recebeDeCima.get(inf) ?? 0) + caiEf)
    sobe.set(inf, (sobe.get(inf) ?? 0) + sobeEf)
    recebeDeBaixo.set(sup, (recebeDeBaixo.get(sup) ?? 0) + sobeEf)
  }

  const final = new Map<number, number>()
  for (const d of divisoes) {
    final.set(
      d.nivel,
      d.tamanho -
        (sobe.get(d.nivel) ?? 0) -
        (cai.get(d.nivel) ?? 0) +
        (recebeDeCima.get(d.nivel) ?? 0) +
        (recebeDeBaixo.get(d.nivel) ?? 0)
    )
  }
  return final
}

/**
 * Sobreviventes (potências de 2 < pv) válidos numa chave COMPLETA de `pv`. Usado
 * pelo modo 'vagas' para oferecer só combinações que o schema aceita: a chave
 * para numa rodada exata que deixa esse nº de vencedores. Ex.: pv=8 ⇒ [1,2,4].
 */
function sobreviventesValidos(pv: number): number[] {
  const out: number[] = []
  for (let v = 1; v < pv; v *= 2) out.push(v)
  return out
}

/** Mensagem de bloqueio do passo de fronteiras (null = ok para avançar). */
function erroConservacao(
  divisoes: DivisaoRascunho[],
  fronteiras: FronteiraRascunho[]
): string | null {
  const porNivel = new Map(divisoes.map((d) => [d.nivel, d]))
  const nomeDe = (nivel: number) =>
    porNivel.get(nivel)?.nome || nomePadraoDivisao(nivel)

  // (0) COERÊNCIA DO PLAYOFF por fronteira (espelha o superRefine do schema).
  // Bloqueia antes da conservação porque uma chave incompleta nem tem efetivos.
  for (const f of fronteiras) {
    if (f.modo === "direto") continue

    // BARRAGEM CRUZADA: bloco DEDICADO (mistura as DUAS divisões). Espelha as
    // rejeições do schema (§9.9): estilo pares/chave; pv par (pares) ou potência
    // de 2 (chave); homogeneidade por_nome; zona cabe em CADA lado. NÃO cai no
    // bloco singular de playoff abaixo (cuja zona-fonte é de UMA divisão só).
    if (f.modo === "barragem_cruzada") {
      const sup = f.nivelSuperior
      if (f.playoffEstilo === undefined || f.playoffVagas === undefined) {
        return `${nomeDe(sup)} ⇄ ${nomeDe(sup + 1)}: complete a configuração da barragem (estilo e nº de participantes).`
      }
      const pv = f.playoffVagas
      if (f.playoffEstilo === "pares") {
        if (pv % 2 !== 0 || pv < 2) {
          return `${nomeDe(sup)} ⇄ ${nomeDe(sup + 1)}: na barragem em pares, o nº de participantes é par (2 por dupla). Use 2, 4, 6…`
        }
      } else if (f.playoffEstilo === "chave") {
        if (!(PLAYOFF_VAGAS_COMPLETAS as readonly number[]).includes(pv)) {
          return `${nomeDe(sup)} ⇄ ${nomeDe(sup + 1)}: a barragem em chave única exige uma chave completa (${PLAYOFF_VAGAS_COMPLETAS.join(", ")}). Para um confronto 1×1, use o estilo "pares".`
        }
      } else {
        return `${nomeDe(sup)} ⇄ ${nomeDe(sup + 1)}: a barragem cruzada usa o estilo "pares" ou "chave".`
      }
      const divSup = porNivel.get(sup)
      const divInf = porNivel.get(sup + 1)
      if (divSup && divInf && divSup.porNome !== divInf.porNome) {
        return `A barragem entre ${nomeDe(sup)} e ${nomeDe(sup + 1)} precisa das duas divisões no mesmo modo (ambas por clube ou ambas por nome).`
      }
      // Zona cabe em CADA lado: pares ⇒ R+B≤tam(sup) E A+B≤tam(inf) (B=pv/2);
      // chave ⇒ R+1≤tam(sup) E A+k≤tam(inf) (k=pv-1). A=acesso, R=rebaixamento.
      const A = f.vagasAcesso
      const R = f.vagasRebaixamento
      const ladoSup = f.playoffEstilo === "pares" ? R + pv / 2 : R + 1
      const ladoInf = f.playoffEstilo === "pares" ? A + pv / 2 : A + (pv - 1)
      if (divSup && ladoSup > divSup.tamanho) {
        return `A barragem de ${nomeDe(sup)} ⇄ ${nomeDe(sup + 1)} precisa de ${ladoSup} competidores de ${divSup.nome || nomePadraoDivisao(divSup.nivel)} (rebaixados diretos + zona de risco), que só tem ${divSup.tamanho}.`
      }
      if (divInf && ladoInf > divInf.tamanho) {
        return `A barragem de ${nomeDe(sup)} ⇄ ${nomeDe(sup + 1)} precisa de ${ladoInf} competidores de ${divInf.nome || nomePadraoDivisao(divInf.nivel)} (promovidos diretos + zona de disputa), que só tem ${divInf.tamanho}.`
      }
      continue
    }

    if (f.playoffEstilo === undefined || f.playoffVagas === undefined) {
      return `${nomeDe(f.nivelSuperior)} ⇄ ${nomeDe(f.nivelSuperior + 1)}: complete a configuração do playoff (estilo e tamanho da chave).`
    }
    const pv = f.playoffVagas
    if (f.playoffEstilo === "vagas") {
      if (!(PLAYOFF_VAGAS_COMPLETAS as readonly number[]).includes(pv)) {
        return `${nomeDe(f.nivelSuperior)} ⇄ ${nomeDe(f.nivelSuperior + 1)}: "a chave decide as vagas" exige uma chave completa (${PLAYOFF_VAGAS_COMPLETAS.join(", ")}).`
      }
      if (f.modo === "playoff_acesso") {
        // Sobreviventes que sobem = vagasAcesso ⇒ potência de 2 < pv.
        if (!ehPotenciaDe2(f.vagasAcesso) || f.vagasAcesso >= pv) {
          return `${nomeDe(f.nivelSuperior)} ⇄ ${nomeDe(f.nivelSuperior + 1)}: numa chave de ${pv} que decide as vagas, o nº que sobe deve ser potência de 2 e menor que ${pv} (${sobreviventesValidos(pv).join(", ")}).`
        }
      } else {
        // playout: sobreviventes salvos = pv - rebaixados ⇒ potência de 2 < pv.
        const sobreviventes = pv - f.vagasRebaixamento
        if (!ehPotenciaDe2(sobreviventes) || sobreviventes >= pv) {
          return `${nomeDe(f.nivelSuperior)} ⇄ ${nomeDe(f.nivelSuperior + 1)}: num playout de ${pv} que decide as vagas, devem sobrar (salvar) uma potência de 2 — caem ${f.vagasRebaixamento} ⇒ sobram ${sobreviventes}.`
        }
      }
    }

    // ZONA da chave cabe na divisão-FONTE (acesso ⇒ inferior; playout ⇒ superior).
    const fonteNivel = f.modo === "playout" ? f.nivelSuperior : f.nivelSuperior + 1
    const fonte = porNivel.get(fonteNivel)
    if (fonte) {
      const zona =
        f.playoffEstilo === "vagas"
          ? pv
          : (f.modo === "playoff_acesso" ? f.vagasAcesso : f.vagasRebaixamento) + pv
      if (zona > fonte.tamanho) {
        return `A chave de ${nomeDe(f.nivelSuperior)} ⇄ ${nomeDe(f.nivelSuperior + 1)} precisa de ${zona} competidores de ${fonte.nome || nomePadraoDivisao(fonte.nivel)}, que só tem ${fonte.tamanho}. Reduza a chave ou as vagas diretas.`
      }
    }
  }

  // SIMETRIA sobre os EFETIVOS (espelha o servidor): sobeEf == caiEf por
  // fronteira — mantém o tamanho de cada divisão estável entre temporadas. Para
  // 'extra' isso já é derivado na UI; esta checagem é defesa via fonte única.
  for (const f of fronteiras) {
    const { sobeEf, caiEf } = movimentoEfetivo(f)
    if (sobeEf !== caiEf) {
      return `${nomeDe(f.nivelSuperior)} ⇄ ${nomeDe(f.nivelSuperior + 1)}: promoveria ${sobeEf} e rebaixaria ${caiEf} — precisa subir e cair o mesmo número.`
    }
  }

  // MOVIMENTO FÍSICO (espelha o superRefine do servidor): a divisão não pode
  // promover E rebaixar mais competidores do que ela tem. O fechamento abaixo
  // pode mascarar isso (ex.: tamanho 3 com 4 sobem + 4 caem ainda fecha em 3),
  // então checamos antes — senão a UI deixaria avançar e o servidor rejeitaria.
  const sobe = new Map<number, number>()
  const cai = new Map<number, number>()
  for (const f of fronteiras) {
    const { sobeEf, caiEf } = movimentoEfetivo(f)
    cai.set(f.nivelSuperior, (cai.get(f.nivelSuperior) ?? 0) + caiEf)
    sobe.set(f.nivelSuperior + 1, (sobe.get(f.nivelSuperior + 1) ?? 0) + sobeEf)
  }
  for (const d of divisoes) {
    const saem = (sobe.get(d.nivel) ?? 0) + (cai.get(d.nivel) ?? 0)
    if (saem > d.tamanho) {
      return `${d.nome || nomePadraoDivisao(d.nivel)} não pode promover e rebaixar ${saem} competidores: ela só tem ${d.tamanho}. Reduza as vagas das fronteiras.`
    }
  }

  const final = tamanhoFinal(divisoes, fronteiras)
  for (const d of divisoes) {
    const pos = final.get(d.nivel) ?? d.tamanho
    if (pos < DIVISAO_MIN_TAMANHO) {
      return `${d.nome || nomePadraoDivisao(d.nivel)} terminaria com ${pos} competidores (mínimo ${DIVISAO_MIN_TAMANHO}). Ajuste tamanhos ou vagas.`
    }
    if (pos > DIVISAO_MAX_TAMANHO) {
      return `${d.nome || nomePadraoDivisao(d.nivel)} terminaria com ${pos} competidores (máximo ${DIVISAO_MAX_TAMANHO}). Ajuste tamanhos ou vagas.`
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Componente principal                                                        */
/* -------------------------------------------------------------------------- */

export function LeagueWizard() {
  const router = useRouter()

  const [passoAtual, setPassoAtual] = React.useState<Passo>("preset")
  const [nome, setNome] = React.useState("")
  const [isPublic, setIsPublic] = React.useState(true)
  // Cores DEFAULT da pirâmide (change add-cores-campeonato): identidade herdada
  // pelas divisões sem cor própria. Vazias ⇒ tema base do app.
  const [corPrimaria, setCorPrimaria] = React.useState("")
  const [corSecundaria, setCorSecundaria] = React.useState("")
  // Fase 5.1: ciclo da temporada (anual | apertura_clausura). Split é só liga (5.1b).
  const [ciclo, setCiclo] = React.useState<"anual" | "apertura_clausura">("anual")
  const [preset, setPreset] = React.useState<PiramidePresetId | null>(null)
  const [divisoes, setDivisoes] = React.useState<DivisaoRascunho[]>([])
  const [fronteiras, setFronteiras] = React.useState<FronteiraRascunho[]>([])
  const [divisaoAtiva, setDivisaoAtiva] = React.useState(0)
  const [enviando, startTransition] = React.useTransition()

  const indicePasso = PASSOS.indexOf(passoAtual)

  function escolherPreset(p: PiramidePresetId) {
    setPreset(p)
    const { divisoes: d, fronteiras: f } = hidratarPreset(p)
    setDivisoes(d)
    setFronteiras(f)
    setDivisaoAtiva(0)
  }

  /* --- Mutações de divisões ---------------------------------------------- */

  function atualizarDivisao(idx: number, patch: Partial<DivisaoRascunho>) {
    setDivisoes((atual) =>
      atual.map((d, i) => {
        if (i !== idx) return d
        const proxima = { ...d, ...patch }
        // Trocar o modo (clube↔nome) limpa competidores incompatíveis.
        if (patch.porNome !== undefined && patch.porNome !== d.porNome) {
          proxima.competidores = []
        }
        // Reduzir o tamanho apara competidores que sobraram.
        if (patch.tamanho !== undefined && proxima.competidores.length > patch.tamanho) {
          proxima.competidores = proxima.competidores.slice(0, patch.tamanho)
        }
        // Fase 5.2: mudar o tamanho pode invalidar a geometria de grupos (a chave
        // não fecha mais) → re-ancora na combinação válida do novo tamanho, ou
        // rebaixa para liga se o tamanho não comportar grupos+mata-mata.
        if (patch.tamanho !== undefined && proxima.formato === "grupos_mata_mata") {
          const g = proxima.qtdGrupos
          const k = proxima.classificadosPorGrupo
          const valido =
            g != null && k != null && erroGeometria(proxima.tamanho, g, k) === null
          if (!valido) {
            const novo = defaultGeometria(proxima.tamanho)
            if (novo) {
              proxima.qtdGrupos = novo.qtdGrupos
              proxima.classificadosPorGrupo = novo.classificadosPorGrupo
            } else {
              proxima.formato = "liga"
              proxima.qtdGrupos = undefined
              proxima.classificadosPorGrupo = undefined
            }
          }
        }
        return proxima
      })
    )
  }

  function adicionarDivisao() {
    // Lê o estado do render atual (clique único — sem concorrência). NÃO aninhar
    // `setFronteiras` dentro do updater de `setDivisoes`: o updater precisa ser PURO
    // e o StrictMode (dev) o invoca 2×, o que duplicaria a fronteira anexada.
    if (divisoes.length >= MAX_DIVISOES) return
    const nivel = divisoes.length + 1
    const desempate = divisoes[divisoes.length - 1]?.desempate ?? "cbf"
    setDivisoes((atual) => [...atual, novaDivisao(nivel, desempate)])
    // Toda nova divisão (>1) ganha uma fronteira "direto" 0/0 com a de cima;
    // o dono ajusta as vagas/modo no passo de fronteiras.
    if (nivel > 1) {
      setFronteiras((fAtual) => [...fAtual, novaFronteira(nivel - 1, 0)])
    }
  }

  function removerDivisao(idx: number) {
    setDivisoes((atual) => {
      if (atual.length <= 1) return atual
      const restantes = atual
        .filter((_, i) => i !== idx)
        // Renumera os níveis para 1..N contínuos.
        .map((d, i) => ({ ...d, nivel: i + 1 }))
      // Recalcula as fronteiras: uma por par adjacente, preservando vagas quando
      // possível pela posição.
      setFronteiras((fAtual) => {
        const novas: FronteiraRascunho[] = []
        for (let nivel = 1; nivel < restantes.length; nivel++) {
          const antiga = fAtual[nivel - 1]
          // ARMADILHA: preservar TODOS os campos da fronteira antiga (modo,
          // estilo, leg, vagas de chave) ao renumerar — só `nivelSuperior` muda.
          // Sem isto, remover uma divisão apagaria a config de playoff das demais.
          novas.push(
            antiga
              ? { ...antiga, nivelSuperior: nivel }
              : novaFronteira(nivel, 0)
          )
        }
        return novas
      })
      return restantes
    })
    // `divisoes` é o valor stale (antes do filter) → length-2 = novo índice máx.
    // Se a removida está ANTES da aba ativa, a ativa desce 1 para seguir a mesma
    // divisão; senão, só clampa ao novo máximo.
    setDivisaoAtiva((a) => {
      const novoMax = divisoes.length - 2
      const alvo = idx < a ? a - 1 : a
      return Math.max(0, Math.min(alvo, novoMax))
    })
  }

  /* --- Mutações de fronteiras -------------------------------------------- */

  function atualizarFronteira(nivelSuperior: number, patch: Partial<FronteiraRascunho>) {
    setFronteiras((atual) =>
      atual.map((f) => (f.nivelSuperior === nivelSuperior ? { ...f, ...patch } : f))
    )
  }

  /* --- Mutações de competidores ------------------------------------------ */

  function adicionarCompetidor(divIdx: number, comp: CompetidorRascunho) {
    setDivisoes((atual) =>
      atual.map((d, i) => {
        if (i !== divIdx) return d
        if (d.competidores.length >= d.tamanho) return d
        return { ...d, competidores: [...d.competidores, comp] }
      })
    )
  }

  function removerCompetidor(divIdx: number, compIdx: number) {
    setDivisoes((atual) =>
      atual.map((d, i) =>
        i === divIdx
          ? { ...d, competidores: d.competidores.filter((_, j) => j !== compIdx) }
          : d
      )
    )
  }

  /* --- Navegação --------------------------------------------------------- */

  const podeAvancar = ((): boolean => {
    if (passoAtual === "preset") return preset !== null && nome.trim().length >= 2
    if (passoAtual === "divisoes")
      return divisoes.every((d) => d.nome.trim().length >= 1)
    if (passoAtual === "fronteiras")
      return erroConservacao(divisoes, fronteiras) === null
    return true
  })()

  function avancar() {
    if (!podeAvancar) return
    setPassoAtual(PASSOS[Math.min(indicePasso + 1, PASSOS.length - 1)])
  }
  function voltar() {
    setPassoAtual(PASSOS[Math.max(indicePasso - 1, 0)])
  }

  /* --- Submit ------------------------------------------------------------ */

  // Vazio ⇒ undefined (a action grava null = herda/tema base). O schema também
  // coage, mas mapeamos aqui para casar com o contrato documentado.
  const corOuUndefined = (v: string) => (v.trim() === "" ? undefined : v)

  function montarInput(): CreateCompetitionInput {
    return {
      nome: nome.trim(),
      isPublic,
      ciclo,
      corPrimaria: corOuUndefined(corPrimaria),
      corSecundaria: corOuUndefined(corSecundaria),
      divisoes: divisoes.map((d) => ({
        nivel: d.nivel,
        nome: d.nome.trim() || nomePadraoDivisao(d.nivel),
        porNome: d.porNome,
        desempate: d.desempate,
        rankingBase: d.rankingBase,
        formato: d.formato,
        // Turno só vale em liga (normalização liga-only — espelha qtdGrupos).
        idaEVolta: d.formato === "liga" ? d.idaEVolta : false,
        qtdGrupos: d.formato === "grupos_mata_mata" ? d.qtdGrupos : undefined,
        classificadosPorGrupo:
          d.formato === "grupos_mata_mata" ? d.classificadosPorGrupo : undefined,
        tamanho: d.tamanho,
        corPrimaria: corOuUndefined(d.corPrimaria),
        corSecundaria: corOuUndefined(d.corSecundaria),
        competidores: d.competidores.map((c) =>
          c.tipo === "nome"
            ? { rotulo: c.rotulo }
            : { teamId: c.teamId, nome: c.nome, escudo: c.escudo }
        ),
      })),
      fronteiras: fronteiras.map((f) => ({
        nivelSuperior: f.nivelSuperior,
        vagasAcesso: f.vagasAcesso,
        vagasRebaixamento: f.vagasRebaixamento,
        modo: f.modo,
        // Campos de playoff só viajam quando há chave (modo !== "direto"); o
        // schema rejeita estilo/vagas numa fronteira direta.
        ...(f.modo !== "direto"
          ? {
              playoffEstilo: f.playoffEstilo,
              playoffVagas: f.playoffVagas,
            }
          : {}),
        playoffIdaEVolta: f.playoffIdaEVolta,
      })),
    }
  }

  function competidoresFaltando(): { nivel: number; faltam: number }[] {
    return divisoes
      .map((d) => ({ nivel: d.nivel, faltam: d.tamanho - d.competidores.length }))
      .filter((x) => x.faltam !== 0)
  }

  function enviar() {
    const faltando = competidoresFaltando()
    if (faltando.length > 0) {
      const d = faltando[0]
      toast.error(
        d.faltam > 0
          ? `Faltam ${d.faltam} competidores na divisão ${d.nivel}.`
          : `Há competidores a mais na divisão ${d.nivel}.`
      )
      return
    }

    // Fase 5.2: barra o submit se alguma divisão de grupos tem geometria que não
    // fecha a chave (o backend também rejeita, mas o toast aponta a divisão).
    const geoRuim = divisoes.find(
      (d) =>
        d.formato === "grupos_mata_mata" &&
        (d.qtdGrupos == null ||
          d.classificadosPorGrupo == null ||
          erroGeometria(d.tamanho, d.qtdGrupos, d.classificadosPorGrupo) !== null)
    )
    if (geoRuim) {
      toast.error(`Ajuste os grupos da divisão ${geoRuim.nivel} antes de criar.`)
      return
    }

    startTransition(async () => {
      const r = await createCompetition(montarInput())
      if (r.competitionId) {
        toast.success("Pirâmide criada! Hora de montar a temporada.")
        router.push(`/dashboard/ligas/${r.seasonId ?? r.competitionId}`)
        return
      }
      if (r.fieldErrors) {
        const primeiro = Object.values(r.fieldErrors).find((v) => v && v.length > 0)
        toast.error(primeiro?.[0] ?? r.error ?? "Verifique os campos e tente de novo.")
        return
      }
      toast.error(r.error ?? "Não foi possível criar a liga agora.")
    })
  }

  /* --- Render ------------------------------------------------------------ */

  return (
    <div className="flex flex-col gap-6">
      <PassosNav atual={indicePasso} />

      <div key={passoAtual} className="animate-rise flex flex-col gap-5">
        {passoAtual === "preset" && (
          <PassoPreset
            nome={nome}
            setNome={setNome}
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            ciclo={ciclo}
            setCiclo={setCiclo}
            corPrimaria={corPrimaria}
            setCorPrimaria={setCorPrimaria}
            corSecundaria={corSecundaria}
            setCorSecundaria={setCorSecundaria}
            preset={preset}
            onEscolher={escolherPreset}
          />
        )}

        {passoAtual === "divisoes" && (
          <PassoDivisoes
            divisoes={divisoes}
            onAtualizar={atualizarDivisao}
            onAdicionar={adicionarDivisao}
            onRemover={removerDivisao}
          />
        )}

        {passoAtual === "fronteiras" && (
          <PassoFronteiras
            divisoes={divisoes}
            fronteiras={fronteiras}
            onAtualizar={atualizarFronteira}
            finais={tamanhoFinal(divisoes, fronteiras)}
            erro={erroConservacao(divisoes, fronteiras)}
          />
        )}

        {passoAtual === "competidores" && (
          <PassoCompetidores
            divisoes={divisoes}
            divisaoAtiva={divisaoAtiva}
            setDivisaoAtiva={setDivisaoAtiva}
            onAdicionar={adicionarCompetidor}
            onRemover={removerCompetidor}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={voltar}
          disabled={indicePasso === 0 || enviando}
          className="rounded-full"
        >
          <ArrowLeft aria-hidden="true" />
          Anterior
        </Button>

        {passoAtual === "competidores" ? (
          <Button
            type="button"
            size="lg"
            onClick={enviar}
            disabled={enviando}
            className="rounded-full"
          >
            <Check aria-hidden="true" />
            {enviando ? "Criando…" : "Criar pirâmide"}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={avancar}
            disabled={!podeAvancar}
            className="rounded-full"
          >
            Próximo
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Indicador de passos                                                         */
/* -------------------------------------------------------------------------- */

function PassosNav({ atual }: { atual: number }) {
  return (
    <ol className="flex list-none items-center gap-1.5 p-0" aria-label="Progresso">
      {PASSOS.map((passo, i) => {
        const ativo = i === atual
        const concluido = i < atual
        return (
          <li key={passo} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                "flex flex-1 flex-col gap-1.5",
                ativo ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 rounded-full transition-colors",
                  ativo || concluido ? "bg-primary" : "bg-muted"
                )}
              />
              <span className="hidden text-xs font-medium sm:block">
                {ROTULO_PASSO[passo]}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 1 — Preset + identidade                                               */
/* -------------------------------------------------------------------------- */

const CARDS_PRESET: { id: PiramidePresetId; titulo: string; desc: string }[] = [
  {
    id: "brasileirao",
    titulo: "Brasileirão",
    desc: "4 sobem · 4 caem por fronteira, desempate CBF.",
  },
  {
    id: "premier",
    titulo: "Premier League",
    desc: "3 sobem · 3 caem por fronteira, desempate inglês.",
  },
  {
    id: PRESET_PERSONALIZADO,
    titulo: "Personalizado",
    desc: "Você define divisões, tamanhos e fronteiras do zero.",
  },
]

function PassoPreset({
  nome,
  setNome,
  isPublic,
  setIsPublic,
  ciclo,
  setCiclo,
  corPrimaria,
  setCorPrimaria,
  corSecundaria,
  setCorSecundaria,
  preset,
  onEscolher,
}: {
  nome: string
  setNome: (v: string) => void
  isPublic: boolean
  setIsPublic: (v: boolean) => void
  ciclo: "anual" | "apertura_clausura"
  setCiclo: (v: "anual" | "apertura_clausura") => void
  corPrimaria: string
  setCorPrimaria: (v: string) => void
  corSecundaria: string
  setCorSecundaria: (v: string) => void
  preset: PiramidePresetId | null
  onEscolher: (p: PiramidePresetId) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2">
        <Label htmlFor="liga-nome">Nome da pirâmide</Label>
        <Input
          id="liga-nome"
          autoComplete="off"
          placeholder="Ex.: Pirâmide da Várzea"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          A pirâmide é imortal: as temporadas se sucedem dentro dela.
        </p>
      </div>

      <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
        <legend className="pb-1 text-sm font-medium">
          Identidade (opcional)
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ColorField
            label="Cor primária"
            value={corPrimaria}
            onChange={setCorPrimaria}
          />
          <ColorField
            label="Cor secundária"
            value={corSecundaria}
            onChange={setCorSecundaria}
            description="Padrão de todas as divisões. Vazio usa o tema do app."
          />
        </div>
      </fieldset>

      <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
        <legend className="pb-1 text-sm font-medium">Formato base</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {CARDS_PRESET.map((c) => {
            const selecionado = preset === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onEscolher(c.id)}
                aria-pressed={selecionado}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selecionado
                    ? "border-primary bg-primary/8 ring-1 ring-primary/40"
                    : "border-border hover:border-primary/40 hover:bg-accent/40"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg transition-colors",
                    selecionado ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Trophy className="size-5" />
                </span>
                <span className="text-sm leading-none font-medium">{c.titulo}</span>
                <span className="text-muted-foreground text-xs">{c.desc}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="border-input accent-primary size-4 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">Partidas públicas</span>
          <span className="text-muted-foreground text-xs">
            Qualquer pessoa acompanha as partidas e os placares ao vivo. As
            divisões e a classificação ficam visíveis enquanto a temporada está
            em disputa.
          </span>
        </span>
      </label>

      <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
        <input
          type="checkbox"
          checked={ciclo === "apertura_clausura"}
          onChange={(e) => setCiclo(e.target.checked ? "apertura_clausura" : "anual")}
          className="border-input accent-primary size-4 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">Apertura/Clausura (temporada dividida)</span>
          <span className="text-muted-foreground text-xs">
            Cada divisão roda dois turnos; o sobe/cai sai da soma anual e o campeão
            de uma grande final entre os campeões dos turnos. Só para divisões de
            liga (sem grupos+mata-mata).
          </span>
        </span>
      </label>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 2 — Divisões                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Campo de tamanho da divisão com estado de TEXTO local: permite limpar e
 * digitar (inclusive 2 dígitos) sem o valor saltar para o mínimo a cada tecla.
 * O clamp [2,20] e o commit ao estado-pai (que pode aparar competidores) só
 * acontecem no blur/Enter — nunca durante a digitação, evitando a perda
 * silenciosa de competidores ao esvaziar o campo.
 */
function CampoTamanhoDivisao({
  id,
  value,
  onCommit,
}: {
  id: string
  value: number
  onCommit: (n: number) => void
}) {
  const [texto, setTexto] = React.useState(String(value))
  // Reflete mudanças EXTERNAS do valor (preset, aparo) sem useEffect — padrão
  // React de ajuste de estado durante o render (compara o último valor visto).
  const [ultimoValue, setUltimoValue] = React.useState(value)
  if (value !== ultimoValue) {
    setUltimoValue(value)
    setTexto(String(value))
  }

  function commit() {
    const n = Number(texto)
    if (texto.trim() === "" || !Number.isFinite(n)) {
      setTexto(String(value)) // restaura o último válido
      return
    }
    const clamped = Math.max(
      DIVISAO_MIN_TAMANHO,
      Math.min(DIVISAO_MAX_TAMANHO, Math.round(n))
    )
    setTexto(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={DIVISAO_MIN_TAMANHO}
      max={DIVISAO_MAX_TAMANHO}
      step={1}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

/**
 * Bloco de FORMATO INTERNO de uma divisão (Fase 5.2): liga ou grupos+mata-mata.
 * Em grupos+mata-mata, oferece SÓ combinações que fecham a chave para o tamanho
 * atual (geradas por `gruposValidosPara`/`classificadosValidosPara`, que reusam
 * `validarGeometria` do motor). Ao trocar para grupos, semeia um default válido;
 * ao voltar para liga, limpa qtdGrupos/classificadosPorGrupo via onAtualizar.
 */
function BlocoFormatoDivisao({
  d,
  idx,
  onAtualizar,
}: {
  d: DivisaoRascunho
  idx: number
  onAtualizar: (idx: number, patch: Partial<DivisaoRascunho>) => void
}) {
  const ehGrupos = d.formato === "grupos_mata_mata"
  const gruposOpcoes = gruposValidosPara(d.tamanho)
  const grupoSemViavel = gruposOpcoes.length === 0
  const ksOpcoes = ehGrupos && d.qtdGrupos ? classificadosValidosPara(d.tamanho, d.qtdGrupos) : []

  // Mensagem de erro inline: a combinação atual fecha a chave? (reusa validarGeometria)
  const erro =
    ehGrupos && d.qtdGrupos !== undefined && d.classificadosPorGrupo !== undefined
      ? erroGeometria(d.tamanho, d.qtdGrupos, d.classificadosPorGrupo)
      : null

  function trocarFormato(formato: DivisaoRascunho["formato"]) {
    if (formato === "liga") {
      onAtualizar(idx, {
        formato,
        qtdGrupos: undefined,
        classificadosPorGrupo: undefined,
      })
      return
    }
    const def = defaultGeometria(d.tamanho)
    onAtualizar(idx, {
      formato,
      qtdGrupos: def?.qtdGrupos,
      classificadosPorGrupo: def?.classificadosPorGrupo,
    })
  }

  // Ao trocar a quantidade de grupos, reancorar K no maior válido para o novo G.
  function trocarGrupos(qtdGrupos: number) {
    const ks = classificadosValidosPara(d.tamanho, qtdGrupos)
    const k =
      d.classificadosPorGrupo !== undefined && ks.includes(d.classificadosPorGrupo)
        ? d.classificadosPorGrupo
        : ks[ks.length - 1]
    onAtualizar(idx, { qtdGrupos, classificadosPorGrupo: k })
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`fmt-${d.nivel}`} className="text-xs">
          Formato
        </Label>
        <select
          id={`fmt-${d.nivel}`}
          value={d.formato}
          onChange={(e) =>
            trocarFormato(e.target.value as DivisaoRascunho["formato"])
          }
          className={SELECT_CLASSE}
        >
          {(Object.keys(FORMATO_ROTULO) as DivisaoRascunho["formato"][]).map((fmt) => (
            <option key={fmt} value={fmt}>
              {FORMATO_ROTULO[fmt]}
            </option>
          ))}
        </select>
      </div>

      {!ehGrupos && (
        <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2">
          <input
            type="checkbox"
            checked={d.idaEVolta}
            onChange={(e) => onAtualizar(idx, { idaEVolta: e.target.checked })}
            className="border-input accent-primary size-4 rounded"
          />
          <span className="text-sm">
            Ida e volta (dois turnos)
            <span className="text-muted-foreground block text-xs font-normal">
              {(() => {
                const p = previaLiga(d.tamanho, d.idaEVolta)
                return `${p.partidas} ${p.partidas === 1 ? "partida" : "partidas"} em ${p.rodadas} ${p.rodadas === 1 ? "rodada" : "rodadas"}. Cada par se enfrenta ${d.idaEVolta ? "duas vezes (casa e fora)" : "uma vez (turno único)"}.`
              })()}
            </span>
          </span>
        </label>
      )}

      {ehGrupos &&
        (grupoSemViavel ? (
          <p className="text-destructive text-xs" role="alert">
            Esta divisão (tamanho {d.tamanho}) não comporta uma fase de grupos que
            feche a chave. Aumente o tamanho ou use o formato de liga.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`grp-${d.nivel}`} className="text-xs">
                  Grupos
                </Label>
                <select
                  id={`grp-${d.nivel}`}
                  value={d.qtdGrupos ?? ""}
                  onChange={(e) => trocarGrupos(Number(e.target.value))}
                  className={SELECT_CLASSE}
                >
                  {gruposOpcoes.map((g) => (
                    <option key={g} value={g}>
                      {g} grupos
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`clf-${d.nivel}`} className="text-xs">
                  Classificados por grupo
                </Label>
                <select
                  id={`clf-${d.nivel}`}
                  value={d.classificadosPorGrupo ?? ""}
                  onChange={(e) =>
                    onAtualizar(idx, { classificadosPorGrupo: Number(e.target.value) })
                  }
                  className={SELECT_CLASSE}
                  disabled={ksOpcoes.length === 0}
                >
                  {ksOpcoes.map((k) => (
                    <option key={k} value={k}>
                      {k} {k === 1 ? "classificado" : "classificados"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-muted-foreground text-[0.7rem]">
              A fase de grupos decide o sobe/cai; o mata-mata coroa o campeão da
              divisão.
            </p>

            {erro && (
              <p className="text-destructive text-xs" role="alert">
                {erro}
              </p>
            )}
          </>
        ))}
    </div>
  )
}

function PassoDivisoes({
  divisoes,
  onAtualizar,
  onAdicionar,
  onRemover,
}: {
  divisoes: DivisaoRascunho[]
  onAtualizar: (idx: number, patch: Partial<DivisaoRascunho>) => void
  onAdicionar: () => void
  onRemover: (idx: number) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Nível 1 é o topo. Cada divisão é uma liga: defina o nome, o tamanho e se
        os competidores são clubes reais ou nomes livres.
      </p>

      <ul className="grid list-none gap-2.5 p-0">
        {divisoes.map((d, idx) => (
          <li
            key={d.nivel}
            className="animate-rise bg-card/60 flex flex-col gap-3 rounded-xl border p-3.5"
            style={{ "--stagger": `${idx * 45}ms` } as React.CSSProperties}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-primary/10 text-primary ring-primary/15 font-display flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ring-1"
              >
                {d.nivel}
              </span>
              <Input
                aria-label={`Nome da divisão ${d.nivel}`}
                value={d.nome}
                maxLength={60}
                placeholder={nomePadraoDivisao(d.nivel)}
                onChange={(e) => onAtualizar(idx, { nome: e.target.value })}
              />
              {divisoes.length > 1 && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onRemover(idx)}
                  aria-label={`Remover divisão ${d.nivel}`}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`tam-${d.nivel}`} className="text-xs">
                  Tamanho ({DIVISAO_MIN_TAMANHO}–{DIVISAO_MAX_TAMANHO})
                </Label>
                <CampoTamanhoDivisao
                  id={`tam-${d.nivel}`}
                  value={d.tamanho}
                  onCommit={(n) => onAtualizar(idx, { tamanho: n })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`des-${d.nivel}`} className="text-xs">
                  Desempate
                </Label>
                <select
                  id={`des-${d.nivel}`}
                  value={d.desempate}
                  onChange={(e) =>
                    onAtualizar(idx, {
                      desempate: e.target.value as DivisaoRascunho["desempate"],
                    })
                  }
                  className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
                >
                  {DESEMPATES_DISPONIVEIS.map((des) => (
                    <option key={des} value={des}>
                      {DESEMPATE_ROTULO[des]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`rank-${d.nivel}`} className="text-xs">
                  Base de sobe/cai
                </Label>
                <select
                  id={`rank-${d.nivel}`}
                  value={d.rankingBase}
                  onChange={(e) =>
                    onAtualizar(idx, {
                      rankingBase: e.target.value as DivisaoRascunho["rankingBase"],
                    })
                  }
                  className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
                >
                  {RANKING_BASES_DISPONIVEIS.map((rb) => (
                    <option key={rb} value={rb}>
                      {RANKING_BASE_ROTULO[rb]}
                    </option>
                  ))}
                </select>
                {d.rankingBase === "promedios" ? (
                  <p className="text-muted-foreground text-xs">
                    Promédio: média de pontos por jogo de toda a história do competidor
                    (vida toda). Decide o sobe/cai no estilo argentino — marque na
                    divisão de elite para rebaixar por promédio.
                  </p>
                ) : null}
              </div>
            </div>

            <BlocoFormatoDivisao d={d} idx={idx} onAtualizar={onAtualizar} />

            {/* Identidade da divisão (change add-cores-campeonato): vazias herdam
                a cor da pirâmide. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorField
                label="Cor primária"
                value={d.corPrimaria}
                onChange={(v) => onAtualizar(idx, { corPrimaria: v })}
              />
              <ColorField
                label="Cor secundária"
                value={d.corSecundaria}
                onChange={(v) => onAtualizar(idx, { corSecundaria: v })}
                description="Vazio herda a cor da pirâmide."
              />
            </div>

            <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2">
              <input
                type="checkbox"
                checked={d.porNome}
                onChange={(e) => onAtualizar(idx, { porNome: e.target.checked })}
                className="border-input accent-primary size-4 rounded"
              />
              <span className="text-sm">
                Competidores por nome
                <span className="text-muted-foreground block text-xs font-normal">
                  Em vez de clubes reais, digite nomes livres (sem escudo, sem convite).
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {divisoes.length < MAX_DIVISOES && (
        <Button
          type="button"
          variant="outline"
          onClick={onAdicionar}
          className="rounded-full"
        >
          <Plus aria-hidden="true" />
          Adicionar divisão
        </Button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 3 — Fronteiras                                                         */
/* -------------------------------------------------------------------------- */

function PassoFronteiras({
  divisoes,
  fronteiras,
  onAtualizar,
  finais,
  erro,
}: {
  divisoes: DivisaoRascunho[]
  fronteiras: FronteiraRascunho[]
  onAtualizar: (nivelSuperior: number, patch: Partial<FronteiraRascunho>) => void
  finais: Map<number, number>
  erro: string | null
}) {
  const porNivel = new Map(divisoes.map((d) => [d.nivel, d]))

  if (fronteiras.length === 0) {
    return (
      <div className="bg-muted/10 text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        <Layers className="text-primary/70 mx-auto mb-3 size-7" aria-hidden="true" />
        Com uma única divisão não há acesso nem queda. Adicione outra divisão para
        configurar as fronteiras.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Em cada fronteira, quantos sobem e caem — e como o corte é decidido: direto
        pela tabela, ou por uma chave de playoff. Sobem e caem o mesmo número, para
        os tamanhos das divisões ficarem estáveis entre temporadas.
      </p>

      <ul className="grid list-none gap-2.5 p-0">
        {fronteiras.map((f) => (
          <CartaoFronteira
            key={f.nivelSuperior}
            f={f}
            sup={porNivel.get(f.nivelSuperior)}
            inf={porNivel.get(f.nivelSuperior + 1)}
            onAtualizar={onAtualizar}
          />
        ))}
      </ul>

      <div className="bg-muted/20 grid gap-1 rounded-lg border p-3 text-xs">
        <p className="text-muted-foreground font-medium">Tamanho após o sobe/cai</p>
        {divisoes.map((d) => {
          const pos = finais.get(d.nivel) ?? d.tamanho
          const ok = pos >= DIVISAO_MIN_TAMANHO && pos <= DIVISAO_MAX_TAMANHO
          return (
            <p
              key={d.nivel}
              className={cn("flex justify-between", ok ? "" : "text-destructive font-medium")}
            >
              <span className="min-w-0 break-words">
                {d.nome || nomePadraoDivisao(d.nivel)}
              </span>
              <span className="font-display shrink-0 tabular-nums">
                {d.tamanho} → {pos}
              </span>
            </p>
          )
        })}
      </div>

      {erro && (
        <p className="text-destructive text-sm" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}

/** Tamanhos de chave (potências de 2, 2..32) oferecidos no estilo 'extra'. */
const CHAVE_TAMANHOS_EXTRA = [2, 4, 8, 16, 32] as const

/** Nº de participantes (PAR, 2..32) oferecidos na barragem em 'pares' (B = pv/2 duplas). */
const BARRAGEM_PARES_TAMANHOS = [2, 4, 6, 8, 10, 12, 14, 16] as const

/** Cartão de configuração de UMA fronteira: modo + (se playoff) estilo/leg/chave. */
function CartaoFronteira({
  f,
  sup,
  inf,
  onAtualizar,
}: {
  f: FronteiraRascunho
  sup?: DivisaoRascunho
  inf?: DivisaoRascunho
  onAtualizar: (nivelSuperior: number, patch: Partial<FronteiraRascunho>) => void
}) {
  const ns = f.nivelSuperior
  const nomeSup = sup?.nome || nomePadraoDivisao(ns)
  const nomeInf = inf?.nome || nomePadraoDivisao(ns + 1)
  const ehBarragem = f.modo === "barragem_cruzada"
  // ehPlayoff = chave de playoff_acesso/playout (NÃO inclui a barragem, que tem
  // sua própria UI dedicada de 2 divisões).
  const ehPlayoff = f.modo !== "direto" && !ehBarragem
  const ehExtra = f.playoffEstilo === "extra"
  // Barragem mistura as DUAS divisões: elas precisam do mesmo modo (por_nome).
  const barragemPorNomeDivergente =
    ehBarragem && sup !== undefined && inf !== undefined && sup.porNome !== inf.porNome

  // Lado que o usuário controla no 'extra' (o outro é derivado).
  const ladoControla = f.modo === "playout" ? "rebaixamento" : "acesso"
  const valorControla =
    f.modo === "playout" ? f.vagasRebaixamento : f.vagasAcesso
  const valorDerivado = valorControla + 1
  const labelControla =
    f.modo === "playout" ? "Caem diretos (queda direta)" : "Sobem diretos (acesso direto)"

  function setVagasSimetrico(v: number) {
    onAtualizar(ns, { vagasAcesso: v, vagasRebaixamento: v })
  }
  function setVagasControla(v: number) {
    // 'extra': escreve o lado controlado e DERIVA o dependente (+1).
    if (f.modo === "playout") {
      onAtualizar(ns, { vagasRebaixamento: v, vagasAcesso: v + 1 })
    } else {
      onAtualizar(ns, { vagasAcesso: v, vagasRebaixamento: v + 1 })
    }
  }

  return (
    <li className="bg-card/60 flex flex-col gap-3 rounded-xl border p-3.5">
      <p className="text-sm font-medium">
        {nomeSup}
        <span className="text-muted-foreground"> ⇄ </span>
        {nomeInf}
      </p>

      {/* Modo do corte — padrão visual do <select> de desempate. */}
      <div className="grid gap-1.5">
        <Label htmlFor={`modo-${ns}`} className="text-xs">
          Como decide o sobe/cai
        </Label>
        <select
          id={`modo-${ns}`}
          value={f.modo}
          onChange={(e) =>
            onAtualizar(ns, patchModoFronteira(f, e.target.value as ModoFronteira))
          }
          className={SELECT_CLASSE}
        >
          {(Object.keys(MODO_ROTULO) as ModoFronteira[]).map((m) => (
            <option key={m} value={m}>
              {MODO_ROTULO[m]}
            </option>
          ))}
        </select>
      </div>

      {f.modo === "direto" && (
        /* direto: simetria obrigatória → um único campo (sobem == caem). */
        <div className="grid gap-1.5">
          <Label htmlFor={`vagas-${ns}`} className="text-xs">
            Sobem e caem (mesmo número)
          </Label>
          <Input
            id={`vagas-${ns}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={f.vagasAcesso}
            onChange={(e) =>
              setVagasSimetrico(Math.max(0, Math.round(Number(e.target.value) || 0)))
            }
          />
        </div>
      )}

      {ehBarragem && (
        <>
          {/* Estilo da barragem — espelha visualmente o de playoff (2 radios).
              O nome acessível do grupo vem do <span> rotulado (via
              aria-labelledby), EXCLUINDO o gatilho de ajuda — senão o nome viraria
              "Estilo da barragem O que é Barragem?". O <legend> segue filho direto
              do <fieldset> (embrulhá-lo quebraria a associação do grupo). */}
          <fieldset
            className="m-0 grid gap-1.5 border-0 p-0"
            aria-labelledby={`barragem-legend-${ns}`}
          >
            <legend className="inline-flex items-center gap-0.5 text-xs font-medium">
              <span id={`barragem-legend-${ns}`}>Estilo da barragem</span>
              <Termo id="barragem" />
            </legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                  f.playoffEstilo === "pares"
                    ? "border-primary bg-primary/8"
                    : "border-border hover:border-primary/40"
                )}
              >
                <input
                  type="radio"
                  name={`estilo-${ns}`}
                  checked={f.playoffEstilo === "pares"}
                  onChange={() => onAtualizar(ns, aplicarEstiloFronteira(f, "pares"))}
                  className="accent-primary mt-0.5 size-3.5"
                />
                <span>
                  Pares (confrontos 1×1)
                  <span className="text-muted-foreground block font-normal">
                    Cada dupla 1×1: vencedor sobe, perdedor cai.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                  f.playoffEstilo === "chave"
                    ? "border-primary bg-primary/8"
                    : "border-border hover:border-primary/40"
                )}
              >
                <input
                  type="radio"
                  name={`estilo-${ns}`}
                  checked={f.playoffEstilo === "chave"}
                  onChange={() => onAtualizar(ns, aplicarEstiloFronteira(f, "chave"))}
                  className="accent-primary mt-0.5 size-3.5"
                />
                <span>
                  Chave única
                  <span className="text-muted-foreground block font-normal">
                    1 da divisão de cima + desafiantes de baixo; o campeão fica em cima.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {/* Diretos SEMPRE simétricos (a barragem é auto-balanceada). */}
          <div className="grid gap-1.5">
            <Label htmlFor={`vagas-${ns}`} className="text-xs">
              Sobem e caem diretos (mesmo número)
            </Label>
            <Input
              id={`vagas-${ns}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={f.vagasAcesso}
              onChange={(e) =>
                setVagasSimetrico(Math.max(0, Math.round(Number(e.target.value) || 0)))
              }
            />
          </div>

          {/* Participantes da barragem: pares ⇒ par (2..16); chave ⇒ {4,8,16,32}. */}
          <div className="grid gap-1.5">
            <Label htmlFor={`chave-${ns}`} className="text-xs">
              {f.playoffEstilo === "pares"
                ? "Participantes na barragem (par)"
                : "Tamanho da chave"}
            </Label>
            <select
              id={`chave-${ns}`}
              value={f.playoffVagas ?? (f.playoffEstilo === "pares" ? 2 : 4)}
              onChange={(e) => onAtualizar(ns, { playoffVagas: Number(e.target.value) })}
              className={SELECT_CLASSE}
            >
              {(f.playoffEstilo === "pares"
                ? BARRAGEM_PARES_TAMANHOS
                : PLAYOFF_VAGAS_COMPLETAS
              ).map((n) => (
                <option key={n} value={n}>
                  {n} competidores
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-[0.7rem]">
              {f.playoffEstilo === "pares"
                ? "Metade vem da divisão de cima, metade da de baixo, em duplas."
                : "1 defensor da divisão de cima e o restante desafia, vindo de baixo."}
            </p>
          </div>

          {barragemPorNomeDivergente && (
            <p className="text-destructive text-xs" role="alert">
              As duas divisões da barragem estão em modos diferentes (clube vs.
              nome). Deixe ambas no mesmo modo para liberar o avanço.
            </p>
          )}

          {/* Leg format (reuso do toggle de playoff). */}
          <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2">
            <input
              type="checkbox"
              checked={f.playoffIdaEVolta}
              onChange={(e) => onAtualizar(ns, { playoffIdaEVolta: e.target.checked })}
              className="border-input accent-primary size-4 rounded"
            />
            <span className="text-sm">
              Ida e volta
              <span className="text-muted-foreground block text-xs font-normal">
                Cada confronto em dois jogos (a final é sempre jogo único).
              </span>
            </span>
          </label>
        </>
      )}

      {ehPlayoff && (
        <>
          {/* Estilo do playoff. */}
          <fieldset className="m-0 grid gap-1.5 border-0 p-0">
            <legend className="text-xs font-medium">Estilo da chave</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                  f.playoffEstilo === "vagas"
                    ? "border-primary bg-primary/8"
                    : "border-border hover:border-primary/40"
                )}
              >
                <input
                  type="radio"
                  name={`estilo-${ns}`}
                  checked={f.playoffEstilo === "vagas"}
                  onChange={() => onAtualizar(ns, aplicarEstiloFronteira(f, "vagas"))}
                  className="accent-primary mt-0.5 size-3.5"
                />
                <span>
                  A chave decide as vagas
                  <span className="text-muted-foreground block font-normal">
                    Toda a zona disputa; os vencedores ocupam as vagas.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                  ehExtra
                    ? "border-primary bg-primary/8"
                    : "border-border hover:border-primary/40"
                )}
              >
                <input
                  type="radio"
                  name={`estilo-${ns}`}
                  checked={ehExtra}
                  onChange={() => onAtualizar(ns, aplicarEstiloFronteira(f, "extra"))}
                  className="accent-primary mt-0.5 size-3.5"
                />
                <span>
                  Direto + 1 na chave
                  <span className="text-muted-foreground block font-normal">
                    Vagas diretas pela tabela e mais 1 decidida na chave.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {/* Vagas: 'vagas' = simétrico; 'extra' = lado controlado + derivado. */}
          {!ehExtra ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`vagas-${ns}`} className="text-xs">
                Sobem e caem (mesmo número)
              </Label>
              <Input
                id={`vagas-${ns}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={f.modo === "playout" ? f.vagasRebaixamento : f.vagasAcesso}
                onChange={(e) =>
                  setVagasSimetrico(Math.max(0, Math.round(Number(e.target.value) || 0)))
                }
              />
              <p className="text-muted-foreground text-[0.7rem]">
                A chave para na rodada que deixa esse nº de vencedores — use uma
                potência de 2 menor que o tamanho da chave.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={`vagas-${ns}`} className="text-xs">
                  {labelControla}
                </Label>
                <Input
                  id={`vagas-${ns}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={valorControla}
                  onChange={(e) =>
                    setVagasControla(Math.max(0, Math.round(Number(e.target.value) || 0)))
                  }
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label className="text-xs">
                  {ladoControla === "acesso" ? "Caem (derivado)" : "Sobem (derivado)"}
                </Label>
                {/* O +1 do 'extra' é de um lado só → o outro é acesso/cai+1, derivado. */}
                <div
                  className="border-input bg-muted/30 text-muted-foreground flex h-8 items-center rounded-lg border px-2.5 text-sm tabular-nums"
                  aria-live="polite"
                >
                  {valorDerivado}
                </div>
              </div>
            </div>
          )}

          {/* Tamanho da chave. */}
          <div className="grid gap-1.5">
            <Label htmlFor={`chave-${ns}`} className="text-xs">
              Tamanho da chave
            </Label>
            <select
              id={`chave-${ns}`}
              value={f.playoffVagas ?? 4}
              onChange={(e) =>
                onAtualizar(ns, { playoffVagas: Number(e.target.value) })
              }
              className={SELECT_CLASSE}
            >
              {(ehExtra ? CHAVE_TAMANHOS_EXTRA : PLAYOFF_VAGAS_COMPLETAS).map(
                (n) => (
                  <option key={n} value={n}>
                    {n} competidores
                  </option>
                )
              )}
            </select>
          </div>

          {/* Leg format. */}
          <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2">
            <input
              type="checkbox"
              checked={f.playoffIdaEVolta}
              onChange={(e) => onAtualizar(ns, { playoffIdaEVolta: e.target.checked })}
              className="border-input accent-primary size-4 rounded"
            />
            <span className="text-sm">
              Ida e volta
              <span className="text-muted-foreground block text-xs font-normal">
                Cada confronto em dois jogos (a final é sempre jogo único).
              </span>
            </span>
          </label>
        </>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 4 — Competidores por divisão                                          */
/* -------------------------------------------------------------------------- */

function PassoCompetidores({
  divisoes,
  divisaoAtiva,
  setDivisaoAtiva,
  onAdicionar,
  onRemover,
}: {
  divisoes: DivisaoRascunho[]
  divisaoAtiva: number
  setDivisaoAtiva: (i: number) => void
  onAdicionar: (divIdx: number, comp: CompetidorRascunho) => void
  onRemover: (divIdx: number, compIdx: number) => void
}) {
  const idx = Math.min(divisaoAtiva, divisoes.length - 1)
  const div = divisoes[idx]

  return (
    <div className="flex flex-col gap-4">
      {/* Abas de divisão (rolagem horizontal no mobile). */}
      {divisoes.length > 1 && (
        <div
          role="tablist"
          aria-label="Divisões"
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          {divisoes.map((d, i) => {
            const completa = d.competidores.length === d.tamanho
            const ativa = i === idx
            return (
              <button
                key={d.nivel}
                id={`tab-comp-${d.nivel}`}
                role="tab"
                aria-selected={ativa}
                aria-controls="painel-competidores"
                tabIndex={ativa ? 0 : -1}
                type="button"
                onClick={() => setDivisaoAtiva(i)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  ativa
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {completa && <Check className="size-3" aria-hidden="true" />}
                {d.nome || nomePadraoDivisao(d.nivel)}
              </button>
            )
          })}
        </div>
      )}

      {div && (
        <DivisaoCompetidores
          key={div.nivel}
          divIdx={idx}
          div={div}
          // Todas as divisões: o guard varre as OUTRAS p/ feedback imediato de
          // repetição cross-divisão (espelha o índice por-competição do banco).
          divisoes={divisoes}
          // Vincula o painel à aba ativa (só quando há abas/tablist).
          painelTabId={divisoes.length > 1 ? `tab-comp-${div.nivel}` : undefined}
          onAdicionar={onAdicionar}
          onRemover={onRemover}
        />
      )}
    </div>
  )
}

function DivisaoCompetidores({
  divIdx,
  div,
  divisoes,
  painelTabId,
  onAdicionar,
  onRemover,
}: {
  divIdx: number
  div: DivisaoRascunho
  /** Todas as divisões — usadas só p/ o guard cross-divisão (feedback imediato). */
  divisoes: DivisaoRascunho[]
  /** Id da aba que rotula este painel (tabpanel) — ausente quando não há abas. */
  painelTabId?: string
  onAdicionar: (divIdx: number, comp: CompetidorRascunho) => void
  onRemover: (divIdx: number, compIdx: number) => void
}) {
  const [adicionando, startTransition] = React.useTransition()
  const [texto, setTexto] = React.useState("")
  const cheia = div.competidores.length >= div.tamanho

  // Clube/nome JÁ presente em OUTRA divisão? O índice de `league_competitors` é
  // por competição (não por divisão), então a repetição cross-divisão é barrada
  // no banco e no Zod — aqui antecipamos o feedback. Clubes comparam por
  // `externalId` (disponível antes do `selectTeam`); nomes por rótulo (lower).
  function clubeEmOutraDivisao(externalId: string) {
    return divisoes.some(
      (d, i) =>
        i !== divIdx &&
        d.competidores.some(
          (c) => c.tipo === "clube" && c.externalId === externalId
        )
    )
  }
  function nomeEmOutraDivisao(rotuloLower: string) {
    return divisoes.some(
      (d, i) =>
        i !== divIdx &&
        d.competidores.some(
          (c) => c.tipo === "nome" && c.rotulo.toLowerCase() === rotuloLower
        )
    )
  }

  function adicionarClube(team: TeamResult) {
    if (cheia) {
      toast.error(`A divisão já tem ${div.tamanho} clubes.`)
      return
    }
    if (
      div.competidores.some(
        (c) => c.tipo === "clube" && c.externalId === team.externalId
      )
    ) {
      toast.error("Esse clube já está nesta divisão.")
      return
    }
    if (clubeEmOutraDivisao(team.externalId)) {
      toast.error("Esse clube já está em outra divisão da temporada.")
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
      onAdicionar(divIdx, {
        tipo: "clube",
        teamId: r.teamId,
        nome: team.nome,
        escudo: team.escudoUrl ?? undefined,
        externalId: team.externalId,
      })
    })
  }

  function adicionarNome() {
    const rotulo = texto.trim()
    if (!rotulo) return
    if (cheia) {
      toast.error(`A divisão já tem ${div.tamanho} competidores.`)
      return
    }
    if (
      div.competidores.some(
        (c) => c.tipo === "nome" && c.rotulo.toLowerCase() === rotulo.toLowerCase()
      )
    ) {
      toast.error("Esse nome já está nesta divisão.")
      return
    }
    if (nomeEmOutraDivisao(rotulo.toLowerCase())) {
      toast.error("Esse nome já está em outra divisão da temporada.")
      return
    }
    onAdicionar(divIdx, { tipo: "nome", rotulo })
    setTexto("")
  }

  return (
    <div
      className="flex flex-col gap-3"
      {...(painelTabId
        ? { id: "painel-competidores", role: "tabpanel", "aria-labelledby": painelTabId }
        : {})}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold">
          {div.nome || nomePadraoDivisao(div.nivel)}
        </h3>
        <span
          className={cn(
            "text-xs font-medium",
            cheia ? "text-primary" : "text-muted-foreground"
          )}
        >
          {div.competidores.length} / {div.tamanho}
        </span>
      </div>

      {div.porNome ? (
        <div className="flex gap-2">
          <Input
            aria-label="Nome do competidor"
            placeholder="Ex.: João"
            value={texto}
            maxLength={80}
            disabled={cheia}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                adicionarNome()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={adicionarNome} disabled={cheia}>
            Adicionar
          </Button>
        </div>
      ) : (
        <TeamSearchInput
          label="Buscar clube"
          placeholder={adicionando ? "Adicionando…" : cheia ? "Divisão cheia" : "Buscar clube…"}
          onSelect={adicionarClube}
        />
      )}

      {div.competidores.length > 0 ? (
        <ul className="grid list-none gap-2 p-0">
          {div.competidores.map((c, i) => (
            <li
              key={c.tipo === "clube" ? `c-${c.teamId}` : `n-${c.rotulo}-${i}`}
              className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                {c.tipo === "clube" ? (
                  <TeamCrest nome={c.nome} escudoUrl={c.escudo ?? null} size={22} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-muted text-muted-foreground flex size-[22px] items-center justify-center rounded-full text-[0.65rem] font-bold"
                  >
                    {c.rotulo.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-sm">
                  {c.tipo === "clube" ? c.nome : c.rotulo}
                </span>
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onRemover(divIdx, i)}
                aria-label={`Remover ${c.tipo === "clube" ? c.nome : c.rotulo}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
          {div.porNome
            ? "Nenhum competidor adicionado ainda."
            : "Nenhum clube adicionado ainda."}
        </p>
      )}
    </div>
  )
}
