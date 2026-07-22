/**
 * Tipos de domínio da feature COPAS (change add-copas-continentais).
 *
 * Núcleo lógico testável (TS puro). Deriva dos tipos do banco (`database.types`)
 * onde a forma é a mesma das tabelas `cup_*`, e introduz os tipos do MOTOR DE
 * DERIVAÇÃO (pool, origem, identidade) que não têm tabela 1:1 — eles modelam o
 * resultado em memória da varredura determinística (ver `derivacao.ts`).
 *
 * Convenção: tipos de tabela = `Database["public"]["Tables"]["cup_*"]["Row"]`;
 * tipos de derivação são novos.
 */

import type {
  CupFormat,
  CupOriginType,
  CupScope,
  Database,
} from "@/lib/supabase/database.types"

/* -------------------------------------------------------------------------- */
/* Tipos de tabela (espelham as Rows do banco)                                  */
/* -------------------------------------------------------------------------- */

/** A copa imortal (config-mãe). */
export type Copa = Database["public"]["Tables"]["cup_competitions"]["Row"]

/** Uma regra de qualificação = faixa de vaga(s) de UMA origem. */
export type RegraQualificacao =
  Database["public"]["Tables"]["cup_qualification_rules"]["Row"]

/** Uma edição da copa (materializa um `tournaments`). */
export type EdicaoCopa = Database["public"]["Tables"]["cup_seasons"]["Row"]

/** Um participante de uma edição (preview ou montado). */
export type ParticipanteCopa = Database["public"]["Tables"]["cup_entries"]["Row"]

/** Uma exclusão persistente (identidade que o dono removeu — re-derivação). */
export type ExclusaoEdicao =
  Database["public"]["Tables"]["cup_season_exclusions"]["Row"]

/* -------------------------------------------------------------------------- */
/* Tipos do motor de derivação (em memória, sem tabela 1:1)                     */
/* -------------------------------------------------------------------------- */

/**
 * Linha da classificação final de uma origem (forma de retorno das RPCs
 * `classificacao_final_divisao`/`classificacao_final_copa`): cada competidor da
 * origem com seu `team_id`/`rotulo`, a `posicao_final` crua (estilo competição,
 * com empates/lacunas) e o `rank` CONTÍGUO de seeding (1..n) sobre o qual a
 * faixa da regra opera (D3). `origem_season_id` rastreia a season/edição
 * consumida.
 *
 * Espelha `Database["public"]["Functions"]["classificacao_final_divisao"]["Returns"][number]`.
 */
export interface OrigemClassificacao {
  /** Clube (modo clube). XOR com `rotulo`. */
  team_id: string | null
  /** Rótulo livre (modo por nome). XOR com `team_id`. */
  rotulo: string | null
  /** Posição final crua na origem (estilo competição: 1,1,3,…). Informativa. */
  posicao_final: number
  /** Rank de seeding contíguo 1..n (a faixa da regra indexa ISTO, não a posição). */
  rank: number
  /** A season/edição encerrada efetivamente consumida (rastreabilidade). */
  origem_season_id: string
  /**
   * league_competitor de origem (add-copa-tecnico-heranca). Presente na origem
   * DIVISÃO (`classificacao_final_divisao`); `null` na origem COPA
   * (`classificacao_final_copa` não expõe competidor). A derivação só o propaga
   * para a entry POR-CLUBE (a regra de herança é `team_id` presente).
   */
  competitor_id: string | null
  /**
   * Técnico VIVO do slot da temporada corrente (change copa-todos-da-piramide).
   * Presente SÓ na origem `divisao_todos` (`inscritos_divisao` resolve do slot);
   * `undefined` nas origens clássicas (`classificacao_final_divisao/_copa` não o
   * expõem). `null` = clube órfão (slot sem técnico). A derivação só o propaga
   * para a entry POR-CLUBE.
   */
  tecnico_user_id?: string | null
}

/**
 * Identidade de um participante DENTRO de uma edição (D5): `team_id` (clube) ou
 * `lower(trim(rotulo))` (rótulo normalizado), SEM componente de origem. Dois
 * rótulos normalizados iguais SÃO o mesmo participante numa edição (alinhado ao
 * UNIQUE de `cup_entries`). String opaca: o prefixo evita colisão entre um
 * team_id (uuid) e um rótulo que por acaso valha esse uuid.
 */
export type IdentidadeParticipante = string

/**
 * Uma entrada derivada do pool: a identidade alocada, sua origem (qual regra e
 * de onde veio o competidor), o seed sequencial (1-based) na ordem do pool e
 * uma descrição legível da origem ("4º Série A — origem season X").
 */
export interface EntradaPool {
  /** Identidade normalizada (chave do dedup). */
  identidade: IdentidadeParticipante
  /** Clube alocado (XOR `rotulo`). */
  team_id: string | null
  /** Rótulo alocado (XOR `team_id`). */
  rotulo: string | null
  /**
   * league_competitor de origem (add-copa-tecnico-heranca): preenchido SÓ na
   * entry POR-CLUBE (`team_id` presente) vinda de origem-DIVISÃO; `null` para
   * por-nome/rótulo (mesmo de divisão), origem-copa e âncora manual. É o elo que
   * faz `montar_copa` herdar o técnico do competidor.
   */
  competitor_id: string | null
  /**
   * Técnico vivo do slot (change copa-todos-da-piramide): gravado SÓ na entry
   * POR-CLUBE de origem `divisao_todos`; `undefined` para clássica/por-nome/copa/
   * âncora. `montar_copa` usa `coalesce(tecnico_user_id, holder_user_id)`.
   */
  tecnico_user_id?: string | null
  /** Seed sequencial 1-based na ordem final do pool. */
  seed: number
  /** Regra que originou esta entrada (NULL em âncora manual). */
  origem_rule_id: string | null
  /** Season/edição-origem consumida (NULL em âncora manual). */
  origem_season_id: string | null
  /** Descrição legível da origem (exibição). */
  origem_descricao: string | null
  /** Âncora do dono (consome identidade no dedup, conta no N/seed). */
  manual: boolean
}

/**
 * Uma lacuna sinalizada no pool: uma vaga de regra que NÃO pôde ser preenchida
 * porque a origem se esgotou (D5). Não vira `cup_entry` (sem placeholder) — fica
 * registrada aqui para a UI avisar.
 */
export interface LacunaPool {
  /** Regra cuja vaga ficou vazia. */
  origem_rule_id: string
  /** Descrição legível da origem que esgotou (exibição). */
  origem_descricao: string | null
}

/**
 * Resultado da derivação (D5): a lista ordenada de entradas (seed contíguo) e as
 * lacunas sinalizadas. `n` = número de participantes efetivos (= `entradas.length`).
 */
export interface PoolDerivado {
  /** Entradas ordenadas por seed (1-based, contíguo). */
  entradas: EntradaPool[]
  /** Vagas que ficaram vazias por origem esgotada (sem placeholder). */
  lacunas: LacunaPool[]
}

/* -------------------------------------------------------------------------- */
/* Re-exports de enums úteis ao consumidor                                      */
/* -------------------------------------------------------------------------- */

export type { CupFormat, CupOriginType, CupScope }
