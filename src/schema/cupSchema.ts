import { z } from "zod"

import { corOpcional } from "@/schema/corSchema"
import { NOME_MAX } from "@/schema/tournamentSchema"

/**
 * Schemas Zod da feature COPAS (change add-copas-continentais).
 *
 * Validam a CONFIGURAÇÃO no cliente/Server Action (a montagem/derivação roda
 * server-side via RPC). Espelham as CHECKs do banco (migration.sql): formato vs.
 * geometria de grupos, XOR de origem da regra, faixa válida, identidade XOR do
 * participante manual. Mensagens em pt-BR; estilo herdado de
 * `leaguePyramidSchema.ts`.
 *
 * Os refines REJEITAM (não avisam): config inconsistente nasceria travada
 * (geometria que não fecha a chave, origem ambígua, faixa invertida).
 */

/** Abrangência da copa (rótulo informativo — D12). */
export const ABRANGENCIAS_DISPONIVEIS = ["nacional", "continental"] as const

/** Formatos da copa (subconjunto de tournament_format). */
export const FORMATOS_COPA_DISPONIVEIS = ["mata_mata", "grupos_mata_mata"] as const

/**
 * Presets de desempate ofertados (mesmo domínio de `tournaments.desempate_criterio`
 * e do CHECK `cup_competitions_desempate_valido`). `custom` é aceito no banco mas
 * degrada para `cbf` — não exposto aqui.
 */
export const DESEMPATES_COPA_DISPONIVEIS = ["cbf", "ingles", "espanhol", "fifa"] as const

/** Tipos de origem de uma regra de qualificação. */
export const ORIGEM_TIPOS_DISPONIVEIS = ["divisao", "copa", "divisao_todos"] as const

/** true se `n` é uma potência de 2 positiva (1,2,4,8…). Espelha o bitwise do CHECK. */
export function ehPotenciaDe2(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

/* -------------------------------------------------------------------------- */
/* cupSchema — criação da copa                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Criação de uma copa (`cup_competitions`). A geometria de grupos
 * (`qtdGrupos`/`classificadosPorGrupo`) só é válida em `grupos_mata_mata` e seu
 * produto DEVE ser uma chave válida: potência de 2 entre 2 e 32 (teto do motor
 * MATA_MATA_MAX_PARTICIPANTES). Espelha o CHECK `cup_competitions_grupos_coerente`.
 */
export const cupSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, "Informe um nome com ao menos 2 caracteres.")
      .max(80, "Nome muito longo."),
    abrangencia: z.enum(ABRANGENCIAS_DISPONIVEIS, {
      error: "Abrangência inválida.",
    }),
    formato: z.enum(FORMATOS_COPA_DISPONIVEIS, {
      error: "Formato de copa inválido.",
    }),
    // Identidade do participante: false = clube; true = por nome (rótulo livre).
    porNome: z.boolean().default(false),
    // Toggles de mata-mata (significativos no mata_mata e no mata-mata pós-grupos).
    idaEVolta: z.boolean().default(false),
    terceiroLugar: z.boolean().default(false),
    // Geometria de grupos: presente SSE formato = grupos_mata_mata (refine abaixo).
    qtdGrupos: z.number().int().positive().optional(),
    classificadosPorGrupo: z.number().int().positive().optional(),
    desempateCriterio: z
      .enum(DESEMPATES_COPA_DISPONIVEIS, { error: "Critério de desempate inválido." })
      .default("cbf"),
    isPublic: z.boolean().default(true),
    // Cores de identidade (opcionais; vazias/ausentes ⇒ undefined → null na action).
    corPrimaria: corOpcional,
    corSecundaria: corOpcional,
  })
  .superRefine((d, ctx) => {
    if (d.formato === "mata_mata") {
      // Mata-mata não carrega geometria de grupos.
      if (d.qtdGrupos != null || d.classificadosPorGrupo != null) {
        ctx.addIssue({
          code: "custom",
          message: "Copa de mata-mata não usa grupos.",
          path: ["qtdGrupos"],
        })
      }
      return
    }

    // grupos_mata_mata: geometria obrigatória e coerente.
    if (d.qtdGrupos == null || d.classificadosPorGrupo == null) {
      ctx.addIssue({
        code: "custom",
        message: "Informe a quantidade de grupos e os classificados por grupo.",
        path: ["qtdGrupos"],
      })
      return
    }
    if (d.qtdGrupos < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Grupos + mata-mata usa pelo menos 2 grupos (para 1 grupo, use mata-mata).",
        path: ["qtdGrupos"],
      })
      return
    }
    if (d.classificadosPorGrupo < 1) {
      ctx.addIssue({
        code: "custom",
        message: "Cada grupo classifica ao menos 1.",
        path: ["classificadosPorGrupo"],
      })
      return
    }
    const produto = d.qtdGrupos * d.classificadosPorGrupo
    // Produto = chave válida: potência de 2 entre 2 e 32 (espelha o CHECK).
    if (produto < 2 || produto > 32 || !ehPotenciaDe2(produto)) {
      ctx.addIssue({
        code: "custom",
        message: `Grupos × classificados deve ser uma potência de 2 entre 2 e 32 (chave completa) — ${d.qtdGrupos} × ${d.classificadosPorGrupo} = ${produto}.`,
        path: ["classificadosPorGrupo"],
      })
    }
  })

export type CupInput = z.infer<typeof cupSchema>

/* -------------------------------------------------------------------------- */
/* cupRuleSchema — regra de qualificação                                        */
/* -------------------------------------------------------------------------- */

/**
 * Uma regra de qualificação (`cup_qualification_rules`). Origem XOR amarrada ao
 * `origemTipo`: divisão e `divisao_todos` exigem `origemCompetitionId` +
 * `origemNivel` (e proíbem `origemCupId`); copa exige `origemCupId` (e proíbe os
 * campos de divisão). Faixa `posicaoInicio..posicaoFim` (fim ≥ início ≥ 1) é
 * obrigatória em divisão/copa e IGNORADA/nula em `divisao_todos` (divisão inteira,
 * sem posição). Espelha `cup_qualification_rules_origem_xor` e `_faixa_valida`.
 */
export const cupRuleSchema = z
  .object({
    origemTipo: z.enum(ORIGEM_TIPOS_DISPONIVEIS, { error: "Tipo de origem inválido." }),
    // Origem divisão / divisao_todos: pirâmide + nível.
    origemCompetitionId: z.uuid({ error: "Pirâmide de origem inválida." }).optional(),
    origemNivel: z
      .number({ error: "Nível inválido." })
      .int("O nível deve ser inteiro.")
      .min(1, "O nível começa em 1.")
      .optional(),
    // Origem copa: outra copa.
    origemCupId: z.uuid({ error: "Copa de origem inválida." }).optional(),
    // Faixa de posições (sobre o rank de seeding contíguo — D3). Opcional: NULA em
    // divisao_todos; obrigatória (via superRefine) em divisão/copa.
    posicaoInicio: z
      .number({ error: "Posição inicial inválida." })
      .int("A posição deve ser inteira.")
      .min(1, "A posição inicial começa em 1.")
      .optional(),
    posicaoFim: z
      .number({ error: "Posição final inválida." })
      .int("A posição deve ser inteira.")
      .min(1, "A posição final começa em 1.")
      .optional(),
    prioridade: z
      .number({ error: "Prioridade inválida." })
      .int("A prioridade deve ser inteira.")
      .default(0),
    rotulo: z
      .string()
      .trim()
      .max(NOME_MAX, `Rótulo muito longo (máx. ${NOME_MAX}).`)
      .optional(),
  })
  .superRefine((r, ctx) => {
    const ehTodos = r.origemTipo === "divisao_todos"

    // Faixa: obrigatória e válida p/ divisão/copa; IGNORADA p/ divisao_todos.
    if (!ehTodos) {
      if (r.posicaoInicio == null) {
        ctx.addIssue({
          code: "custom",
          message: "Informe a posição inicial.",
          path: ["posicaoInicio"],
        })
      }
      if (r.posicaoFim == null) {
        ctx.addIssue({
          code: "custom",
          message: "Informe a posição final.",
          path: ["posicaoFim"],
        })
      }
      if (
        r.posicaoInicio != null &&
        r.posicaoFim != null &&
        r.posicaoFim < r.posicaoInicio
      ) {
        ctx.addIssue({
          code: "custom",
          message: "A posição final deve ser maior ou igual à inicial.",
          path: ["posicaoFim"],
        })
      }
    }

    // Origem por divisão (clássica OU divisao_todos): exige pirâmide + nível.
    if (r.origemTipo === "divisao" || ehTodos) {
      if (r.origemCompetitionId == null) {
        ctx.addIssue({
          code: "custom",
          message: "Escolha a pirâmide de origem.",
          path: ["origemCompetitionId"],
        })
      }
      if (r.origemNivel == null) {
        ctx.addIssue({
          code: "custom",
          message: "Escolha o nível (divisão) de origem.",
          path: ["origemNivel"],
        })
      }
      if (r.origemCupId != null) {
        ctx.addIssue({
          code: "custom",
          message: "Origem de divisão não usa copa.",
          path: ["origemCupId"],
        })
      }
      return
    }

    // origemTipo === "copa".
    if (r.origemCupId == null) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha a copa de origem.",
        path: ["origemCupId"],
      })
    }
    if (r.origemCompetitionId != null || r.origemNivel != null) {
      ctx.addIssue({
        code: "custom",
        message: "Origem de copa não usa pirâmide/nível.",
        path: ["origemCompetitionId"],
      })
    }
  })

export type CupRuleInput = z.infer<typeof cupRuleSchema>

/* -------------------------------------------------------------------------- */
/* cupManualEntrySchema — participante manual                                   */
/* -------------------------------------------------------------------------- */

/**
 * Um participante adicionado manualmente a uma edição em rascunho
 * (`cup_entries` com `manual=true`). Identidade XOR (clube vs. rótulo) coerente
 * com `porNome` da copa: copa por clube exige `teamId`; copa por nome exige
 * `rotulo`. Espelha `cup_entries_clube_xor_rotulo`. O rótulo é normalizado
 * (trim) para a comparação de duplicata case-insensitive (feita na action /
 * pelo UNIQUE do banco).
 */
export const cupManualEntrySchema = z
  .object({
    // `porNome` da copa-mãe (contexto): decide qual identidade é exigida.
    porNome: z.boolean(),
    teamId: z.uuid({ error: "Clube inválido." }).optional(),
    rotulo: z
      .string()
      .trim()
      .min(1, "Nome vazio.")
      .max(NOME_MAX, `Nome muito longo (máx. ${NOME_MAX}).`)
      .optional(),
  })
  .superRefine((m, ctx) => {
    if (m.porNome) {
      if (m.rotulo == null) {
        ctx.addIssue({
          code: "custom",
          message: "Esta copa é por nome: informe um rótulo.",
          path: ["rotulo"],
        })
      }
      if (m.teamId != null) {
        ctx.addIssue({
          code: "custom",
          message: "Esta copa é por nome: não selecione um clube.",
          path: ["teamId"],
        })
      }
      return
    }
    // Copa por clube.
    if (m.teamId == null) {
      ctx.addIssue({
        code: "custom",
        message: "Esta copa é por clube: selecione um clube.",
        path: ["teamId"],
      })
    }
    if (m.rotulo != null) {
      ctx.addIssue({
        code: "custom",
        message: "Esta copa é por clube: não informe um rótulo livre.",
        path: ["rotulo"],
      })
    }
  })

export type CupManualEntryInput = z.infer<typeof cupManualEntrySchema>
