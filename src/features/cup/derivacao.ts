/**
 * Motor PURO da derivação de participantes de uma copa (change
 * add-copas-continentais) — zero IO, mesma filosofia dos demais motores
 * (`gerarChaveMataMata`, `computeStandings`): a action busca/lê as origens via
 * RPC, chama este motor com `lerOrigem` injetada, e grava as `cup_entries`.
 *
 * Implementa D3 (faixa sobre rank contíguo), D5 (dedup por identidade global —
 * sem origem; cada vaga varre a origem do próprio rankAlvo; manuais como âncora;
 * exclusões persistentes; origem esgotada ⇒ vaga vazia sem placeholder) e D7
 * (geometria por formato).
 *
 * Determinístico e puro: sem Date.now / Math.random. A ordem do pool é função
 * exclusiva de (prioridade, rank-na-origem) das regras + âncoras manuais.
 */

import { MATA_MATA_MAX_PARTICIPANTES } from "@/features/knockout/gerarChaveMataMata"
import { validarGeometria } from "@/features/groups/gerarFaseDeGrupos"

import type {
  CupFormat,
  EntradaPool,
  IdentidadeParticipante,
  LacunaPool,
  OrigemClassificacao,
  PoolDerivado,
  RegraQualificacao,
} from "@/features/cup/types"

/* -------------------------------------------------------------------------- */
/* Identidade                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Identidade de edição (D5): `team_id` (clube) OU `lower(trim(rotulo))` (rótulo
 * normalizado), SEM componente de origem. Prefixo `t:`/`r:` impede colisão entre
 * um uuid de clube e um rótulo que por acaso valha esse uuid.
 */
export function identidadeDe(
  team_id: string | null,
  rotulo: string | null
): IdentidadeParticipante {
  if (team_id != null) return `t:${team_id}`
  if (rotulo != null) return `r:${rotulo.trim().toLowerCase()}`
  throw new Error("Participante sem team_id nem rótulo (XOR violado).")
}

/* -------------------------------------------------------------------------- */
/* Chave de origem (cache de leitura compartilhado entre regras da mesma origem) */
/* -------------------------------------------------------------------------- */

/**
 * Chave que agrupa regras que compartilham a MESMA classificação de origem (uma
 * leitura por origem). Divisão: `competition_id` + `nivel`. Copa: `cup_id`. Regras
 * da mesma divisão/copa leem a mesma lista; o dedup é global por identidade, então
 * regras da mesma origem não duplicam um competidor mesmo lendo a mesma lista.
 */
export function chaveDaOrigem(regra: RegraQualificacao): string {
  if (regra.origem_tipo === "divisao") {
    return `div:${regra.origem_competition_id}:${regra.origem_nivel}`
  }
  // `divisao_todos` compartilha (competition_id, nivel) com `divisao`, mas a leitura
  // vem de OUTRA RPC (`inscritos_divisao` vs `classificacao_final_divisao`): a chave
  // `todos:…` é DISTINTA de `div:…` (load-bearing — compartilhar o cache serviria a
  // lista errada). O dedup global por identidade evita duplicar um clube entre elas.
  if (regra.origem_tipo === "divisao_todos") {
    return `todos:${regra.origem_competition_id}:${regra.origem_nivel}`
  }
  return `cup:${regra.origem_cup_id}`
}

/* -------------------------------------------------------------------------- */
/* Geometria por formato (D7)                                                   */
/* -------------------------------------------------------------------------- */

export interface ResultadoGeometria {
  ok: boolean
  /** Nome estável do erro (para a UI mapear mensagem). null quando ok. */
  erro:
    | "COPA_SEM_PARTICIPANTES_SUFICIENTES"
    | "COPA_LOTADA"
    | "COPA_GEOMETRIA_INVALIDA"
    | null
  /** Mensagem legível pt-BR (vazia quando ok). */
  mensagem: string
}

/**
 * Valida o tamanho/geometria do pool EFETIVO `n` (vagas vazias já excluídas)
 * contra o formato (D7).
 *
 * - `mata_mata`: 2 ≤ n ≤ MATA_MATA_MAX_PARTICIPANTES (32). Vaga vazia ⇒ n menor
 *   ⇒ byes (absorvidos pelo motor de chave). < 2 ⇒ sem participantes; > 32 ⇒
 *   lotada.
 * - `grupos_mata_mata`: delega a `validarGeometria(n, G, K)` (do motor de grupos),
 *   que exige G·K potência de 2 (chave completa ≤ 32), G ∈ {1,2,4,8} e K menor
 *   que o menor grupo. Qualquer falha ⇒ COPA_GEOMETRIA_INVALIDA com a mensagem
 *   original do motor.
 */
export function validarGeometriaCopa(
  formato: CupFormat,
  n: number,
  qtd_grupos?: number | null,
  classificados_por_grupo?: number | null
): ResultadoGeometria {
  if (formato === "mata_mata") {
    if (n < 2) {
      return {
        ok: false,
        erro: "COPA_SEM_PARTICIPANTES_SUFICIENTES",
        mensagem: "A copa precisa de pelo menos 2 participantes.",
      }
    }
    if (n > MATA_MATA_MAX_PARTICIPANTES) {
      return {
        ok: false,
        erro: "COPA_LOTADA",
        mensagem: `A chave aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} participantes — recorte o pool manualmente.`,
      }
    }
    return { ok: true, erro: null, mensagem: "" }
  }

  // grupos_mata_mata: a geometria precisa estar presente.
  if (qtd_grupos == null || classificados_por_grupo == null) {
    return {
      ok: false,
      erro: "COPA_GEOMETRIA_INVALIDA",
      mensagem: "Informe a quantidade de grupos e os classificados por grupo.",
    }
  }
  try {
    validarGeometria(n, qtd_grupos, classificados_por_grupo)
    return { ok: true, erro: null, mensagem: "" }
  } catch (e) {
    return {
      ok: false,
      erro: "COPA_GEOMETRIA_INVALIDA",
      mensagem: e instanceof Error ? e.message : "Geometria de grupos inválida.",
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Derivação do pool (D5)                                                        */
/* -------------------------------------------------------------------------- */

/** Função injetada: lê a classificação final ordenada (rank contíguo) de UMA origem. */
export type LerOrigem = (regra: RegraQualificacao) => OrigemClassificacao[]

/**
 * Uma âncora manual: participante que o dono fixou (consome identidade no dedup,
 * conta no N/seed). O chamador (action) já resolveu team_id/rotulo da entry
 * `manual=true`. Não tem origem (regra/season) — vira `null`.
 */
export interface AncoraManual {
  team_id: string | null
  rotulo: string | null
}

/** Uma vaga atômica de regra (uma posição da faixa, expandida). */
interface VagaRegra {
  regra: RegraQualificacao
  chaveOrigem: string
  prioridade: number
  /** Rank-na-origem alvo desta vaga (posicao_inicio..posicao_fim). */
  rankAlvo: number
}

/**
 * Deriva o pool de participantes de uma edição (D5), EXATO:
 *
 * 1. Âncoras manuais entram primeiro como entradas fixas — consomem identidade
 *    no conjunto global de alocados e contam no N/seed. Uma âncora cuja
 *    identidade está excluída ou duplicada entre as próprias âncoras é
 *    ignorada (defensivo; a action já barra duplicata manual com
 *    PARTICIPANTE_DUPLICADO).
 * 2. Expande cada regra nas suas vagas atômicas (uma por rank da faixa
 *    `posicao_inicio..posicao_fim`).
 * 3. Varredura ÚNICA determinística ordenada por (prioridade asc, rankAlvo asc,
 *    e — desempate estável — ordem original das regras). Para cada vaga:
 *    - varre a lista da origem a partir do PRÓPRIO `rankAlvo` (NÃO de um cursor
 *      monotônico compartilhado): escolhe o primeiro rank `>= rankAlvo` cuja
 *      identidade não esteja alocada nem excluída; aloca-o, registra a entrada.
 *    - se a origem se esgota antes de achar um livre ⇒ a vaga fica VAZIA
 *      (lacuna sinalizada, sem placeholder).
 *
 * Identidade = team_id OU lower(trim(rotulo)), SEM origem. Exclusões = Set de
 * identidades (mesmo formato de `identidadeDe`).
 *
 * O Set GLOBAL `alocados` (não um cursor monotônico) preserva o dedup e a
 * semântica "cair para o próximo": quando uma regra de alta prioridade "rouba" um
 * competidor que outra regra (mesma origem, prioridade menor) também pegaria, a
 * segunda — varrendo a MESMA origem do seu próprio rankAlvo — encontra o roubado
 * já em `alocados` e CAI para o próximo livre. Como cada vaga parte de
 * `vaga.rankAlvo` (e não de um cursor que só avança), regras de prioridade ALTA
 * com rankAlvo MAIOR não escondem ranks BAIXOS ainda livres de regras de
 * prioridade baixa na mesma origem. Duas vagas com o mesmo rankAlvo não duplicam:
 * a primeira já adicionou ao Set antes de a segunda varrer.
 */
export function derivarPool(
  regras: RegraQualificacao[],
  lerOrigem: LerOrigem,
  manuais: AncoraManual[],
  exclusoes: Set<IdentidadeParticipante>
): PoolDerivado {
  const entradas: EntradaPool[] = []
  const lacunas: LacunaPool[] = []
  const alocados = new Set<IdentidadeParticipante>()

  /* 1) Âncoras manuais — fixas, consomem identidade, contam no N. */
  for (const m of manuais) {
    const id = identidadeDe(m.team_id, m.rotulo)
    if (exclusoes.has(id) || alocados.has(id)) continue
    alocados.add(id)
    entradas.push({
      identidade: id,
      team_id: m.team_id,
      rotulo: m.rotulo,
      // Âncora manual = SEM técnico (decisão do dono): competitor_id null.
      competitor_id: null,
      seed: 0, // renumerado no fim
      origem_rule_id: null,
      origem_season_id: null,
      origem_descricao: null,
      manual: true,
    })
  }

  /* 2) Lê cada origem UMA vez (cache por chave de origem — leitura compartilhada). */
  const cacheOrigem = new Map<string, OrigemClassificacao[]>()
  const lerCache = (regra: RegraQualificacao): OrigemClassificacao[] => {
    const chave = chaveDaOrigem(regra)
    let lista = cacheOrigem.get(chave)
    if (lista === undefined) {
      lista = lerOrigem(regra)
      cacheOrigem.set(chave, lista)
    }
    return lista
  }

  /* 2b) Expande regras de FAIXA (divisao/copa) em vagas atômicas e ordena a
   *     varredura. `divisao_todos` NÃO entra aqui: é um ramo dedicado (passo 3)
   *     que consome a lista inteira sem contagem-alvo nem lacunas — reusar a
   *     máquina de N vagas 1..N geraria lacunas fantasma quando o dedup (âncora
   *     ou regra clássica sobreposta) esgota o alvo. */
  const vagas: VagaRegra[] = []
  regras.forEach((regra) => {
    // Garante o cache populado (também para regras que possam ficar todas vazias).
    lerCache(regra)
    if (regra.origem_tipo === "divisao_todos") return
    const inicio = regra.posicao_inicio
    const fim = regra.posicao_fim
    // Faixa nula numa regra de faixa não deveria ocorrer (CHECK _faixa_valida a
    // exige); guarda defensiva para o tipo nullable do banco.
    if (inicio == null || fim == null) return
    for (let rank = inicio; rank <= fim; rank++) {
      vagas.push({
        regra,
        chaveOrigem: chaveDaOrigem(regra),
        prioridade: regra.prioridade,
        rankAlvo: rank,
      })
    }
  })

  // Índice original de cada regra para desempate estável na ordenação.
  const ordemRegra = new Map<string, number>()
  regras.forEach((r, i) => ordemRegra.set(r.id, i))

  vagas.sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
    if (a.rankAlvo !== b.rankAlvo) return a.rankAlvo - b.rankAlvo
    // Desempate estável: ordem de declaração das regras.
    const oa = ordemRegra.get(a.regra.id) ?? 0
    const ob = ordemRegra.get(b.regra.id) ?? 0
    if (oa !== ob) return oa - ob
    return a.regra.id < b.regra.id ? -1 : a.regra.id > b.regra.id ? 1 : 0
  })

  for (const vaga of vagas) {
    const lista = cacheOrigem.get(vaga.chaveOrigem) ?? []
    // SEM cursor monotônico: cada vaga varre a origem a partir do PRÓPRIO rankAlvo.
    // Isso evita que uma regra de prioridade alta com rankAlvo grande avance um
    // cursor compartilhado além de ranks baixos ainda livres de outra regra. O dedup
    // global (`alocados`) garante "cair para o próximo" sem duplicar.
    const inicio = vaga.rankAlvo

    let escolhido: OrigemClassificacao | null = null
    // A origem é uma lista 1..n por rank contíguo; busca o primeiro rank >= inicio
    // cuja identidade esteja livre. As linhas vêm ordenadas por rank crescente.
    for (const linha of lista) {
      if (linha.rank < inicio) continue
      const id = identidadeDe(linha.team_id, linha.rotulo)
      if (alocados.has(id) || exclusoes.has(id)) {
        // Identidade já tomada (por âncora, por outra vaga, ou excluída): pula.
        continue
      }
      escolhido = linha
      break
    }

    if (escolhido === null) {
      // Origem esgotada para esta vaga ⇒ lacuna (sem placeholder — D5).
      lacunas.push({
        origem_rule_id: vaga.regra.id,
        origem_descricao: descricaoOrigem(vaga.regra, null),
      })
      continue
    }

    const id = identidadeDe(escolhido.team_id, escolhido.rotulo)
    alocados.add(id)
    entradas.push({
      identidade: id,
      team_id: escolhido.team_id,
      rotulo: escolhido.rotulo,
      // Herança de técnico SÓ por-CLUBE de origem-divisão (add-copa-tecnico-heranca):
      // a regra é `team_id` presente, NÃO "a origem devolveu competitor_id" — um
      // competidor de divisão por-NOME também tem competitor_id, mas entra como
      // rótulo (team_id null) e fica sem técnico. Origem-copa já vem competitor_id
      // null de `lerOrigemViaRpc`.
      competitor_id: escolhido.team_id != null ? escolhido.competitor_id : null,
      // Técnico dinâmico só na origem `divisao_todos` (aqui sempre undefined — as
      // RPCs clássicas não o expõem). Guardado por team_id (só por-clube).
      tecnico_user_id:
        escolhido.team_id != null ? (escolhido.tecnico_user_id ?? null) : null,
      seed: 0, // renumerado no fim
      origem_rule_id: vaga.regra.id,
      origem_season_id: escolhido.origem_season_id,
      origem_descricao: descricaoOrigem(vaga.regra, escolhido),
      manual: false,
    })
  }

  /* 3) Ramo DEDICADO `divisao_todos`: consome a LISTA INTEIRA de cada origem e
   *    adiciona toda identidade ainda LIVRE (dedup global + exclusões), SEM
   *    contagem-alvo e SEM emitir LacunaPool — "divisão inteira" não tem "vaga
   *    vazia por origem esgotada". Roda DEPOIS das regras de faixa: assim um clube
   *    já pego por uma âncora ou por uma regra clássica sobreposta é só pulado
   *    (não vira lacuna fantasma), e o clube ainda entra pela promessa "todos". A
   *    ordem entre regras `divisao_todos` é (prioridade, ordem de declaração). */
  const regrasTodos = regras
    .filter((r) => r.origem_tipo === "divisao_todos")
    .sort((a, b) => {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
      const oa = ordemRegra.get(a.id) ?? 0
      const ob = ordemRegra.get(b.id) ?? 0
      if (oa !== ob) return oa - ob
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  for (const regra of regrasTodos) {
    const lista = cacheOrigem.get(chaveDaOrigem(regra)) ?? []
    // A lista vem em rank crescente (ordem determinística da RPC).
    for (const linha of lista) {
      const id = identidadeDe(linha.team_id, linha.rotulo)
      if (alocados.has(id) || exclusoes.has(id)) continue
      alocados.add(id)
      entradas.push({
        identidade: id,
        team_id: linha.team_id,
        rotulo: linha.rotulo,
        competitor_id: linha.team_id != null ? linha.competitor_id : null,
        // Técnico vivo do slot (LEFT JOIN — órfão vem null); só por-clube.
        tecnico_user_id:
          linha.team_id != null ? (linha.tecnico_user_id ?? null) : null,
        seed: 0, // renumerado no fim
        origem_rule_id: regra.id,
        origem_season_id: linha.origem_season_id,
        origem_descricao: descricaoOrigem(regra, linha),
        manual: false,
      })
    }
  }

  /* 4) Seed sequencial contíguo (1-based) na ORDEM final do pool: âncoras primeiro
   *    (na ordem em que vieram), depois as derivadas na ordem da varredura. */
  entradas.forEach((e, i) => {
    e.seed = i + 1
  })

  return { entradas, lacunas }
}

/**
 * Descrição legível da origem de uma entrada/lacuna (exibição). Mantém-se
 * simples e sem IO: a action enriquece com nomes reais (pirâmide/copa/temporada)
 * a partir de `origem_rule_id`/`origem_season_id`. Aqui usamos o `rotulo` da
 * regra (rótulo da vaga, ex.: "Campeão Série A") quando presente, somando a
 * posição crua na origem.
 */
function descricaoOrigem(
  regra: RegraQualificacao,
  linha: OrigemClassificacao | null
): string | null {
  const base = regra.rotulo?.trim() || null
  if (linha === null) {
    return base // lacuna: só o rótulo da vaga (a posição não foi preenchida)
  }
  if (base) {
    return `${base} (${linha.posicao_final}º)`
  }
  return `${linha.posicao_final}º`
}
