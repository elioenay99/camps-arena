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
 * classificação. `formato` espelha o enum `tournament_format`; `idaEVolta` só
 * é significativo em liga (no avulso fica false, default do banco).
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
      .enum(["avulso", "liga"], { error: "Formato de torneio inválido." })
      .default("avulso"),
    idaEVolta: z.boolean().default(false),
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
