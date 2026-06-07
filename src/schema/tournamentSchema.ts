import { z } from "zod"

/** Defaults de pontuação (convenção do futebol) — compartilhados com o form. */
export const PONTUACAO_PADRAO = { vitoria: 3, empate: 1, derrota: 0 } as const

/** Teto sano de pontos por resultado — espelha a CHECK do banco. */
export const PONTOS_MAX = 100

/**
 * Pontos por resultado: inteiro 0–100. Sem `coerce` de propósito (mesma
 * decisão do placar): a action converte explicitamente a string do form, e
 * coerção silenciosa aceitaria lixo num caminho alcançável por POST direto.
 */
const pontos = z
  .number({ error: "Pontuação inválida." })
  .int("A pontuação deve ser um número inteiro.")
  .min(0, "A pontuação não pode ser negativa.")
  .max(PONTOS_MAX, "Pontuação fora do intervalo permitido.")

/**
 * Criação de torneio: título, visibilidade, regras de pontuação e formato.
 * O refine espelha a CHECK `tournaments_pontuacao_coerente` do banco — derrota
 * valendo mais que empate (ou empate mais que vitória) corromperia a
 * classificação. `formato` espelha o enum `tournament_format`; `idaEVolta`
 * vale em liga e mata-mata; `terceiroLugar` só em mata-mata (a action
 * normaliza para false nos formatos em que a opção não se aplica).
 */
export const createTournamentSchema = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(2, "Informe um título com ao menos 2 caracteres.")
      .max(80, "Título muito longo."),
    isPublic: z.boolean().default(true),
    formato: z
      .enum(["avulso", "liga", "mata_mata", "grupos_mata_mata", "fase_liga"], {
        error: "Formato de torneio inválido.",
      })
      .default("avulso"),
    idaEVolta: z.boolean().default(false),
    terceiroLugar: z.boolean().default(false),
    pontosVitoria: pontos.default(PONTUACAO_PADRAO.vitoria),
    pontosEmpate: pontos.default(PONTUACAO_PADRAO.empate),
    pontosDerrota: pontos.default(PONTUACAO_PADRAO.derrota),
  })
  .refine((d) => d.pontosDerrota <= d.pontosEmpate, {
    error: "A derrota não pode valer mais pontos que o empate.",
    path: ["pontosDerrota"],
  })
  .refine((d) => d.pontosEmpate <= d.pontosVitoria, {
    error: "O empate não pode valer mais pontos que a vitória.",
    path: ["pontosEmpate"],
  })

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>

/**
 * Início de mata-mata: o modo de chaveamento NÃO persiste — é parâmetro da
 * action. `cabecas` (modo potes) e `confrontos` (modo manual) chegam do form
 * do painel de início; a action valida a coerência com os participantes
 * confirmados (o Zod valida só a FORMA — uuids e pares).
 */
export const iniciarMataMataSchema = z.object({
  tournamentId: z.uuid({ error: "Torneio inválido." }),
  modo: z.enum(["sorteio", "potes", "manual"], {
    error: "Modo de chaveamento inválido.",
  }),
  cabecas: z.array(z.uuid()).default([]),
  confrontos: z
    .array(z.tuple([z.uuid().nullable(), z.uuid().nullable()]))
    .default([]),
})

export type IniciarMataMataInput = z.infer<typeof iniciarMataMataSchema>

/**
 * Início de torneio de grupos (grupos_mata_mata/fase_liga): G, K e o modo
 * chegam do form do painel — só K persiste (coluna). O Zod valida a FORMA;
 * a geometria (G·K potência de 2, K < menor grupo) e a coerência com os
 * participantes ficam na action/motor.
 */
export const iniciarGruposSchema = z.object({
  tournamentId: z.uuid({ error: "Torneio inválido." }),
  modo: z.enum(["sorteio", "potes", "manual"], {
    error: "Modo de distribuição inválido.",
  }),
  qtdGrupos: z
    .number({ error: "Quantidade de grupos inválida." })
    .int()
    .min(1)
    .max(8),
  classificadosPorGrupo: z
    .number({ error: "Classificados por grupo inválido." })
    .int()
    .min(1)
    .max(16),
  cabecas: z.array(z.uuid()).default([]),
  /** Modo manual: grupo escolhido por participante (uuid → nº do grupo). */
  atribuicao: z.array(z.tuple([z.uuid(), z.number().int().min(1).max(8)])).default([]),
})

export type IniciarGruposInput = z.infer<typeof iniciarGruposSchema>
