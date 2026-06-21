import "server-only"

import { createClient } from "@/lib/supabase/server"

import type { CupCompetitionStatus, CupFormat, CupScope } from "@/lib/supabase/database.types"

/** Resumo de uma copa para o índice /dashboard/copas. */
export interface CopaResumo {
  id: string
  nome: string
  abrangencia: CupScope
  formato: CupFormat
  status: CupCompetitionStatus
  isPublic: boolean
  corPrimaria: string | null
  corSecundaria: string | null
  /** Nº de edições já criadas. */
  numEdicoes: number
  /** Número da edição corrente (1-based) — null se nenhuma edição existe. */
  edicaoAtual: number | null
  /** Status da edição corrente — insumo da pílula. */
  statusEdicao: import("@/lib/supabase/database.types").CupSeasonStatus | null
  /** Id da edição corrente (alvo do link "abrir"). */
  edicaoAtualId: string | null
}

/** Forma crua da edição embutida na copa. */
interface EdicaoEmbed {
  id: string
  numero: number
  status: import("@/lib/supabase/database.types").CupSeasonStatus
}

/**
 * Copas do usuário para o índice /dashboard/copas. Filtra por `created_by` (a RLS
 * também deixa passar copas públicas de terceiros, então confiar só nela listaria
 * copas alheias — espelha getCompetitions). Embute as edições; a "edição corrente"
 * é a de maior `numero`. Ordena as copas pela mais recente. Lança em erro de IO.
 */
export async function getCups(userId: string): Promise<CopaResumo[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("cup_competitions")
    .select(
      "id, nome, abrangencia, formato, status, is_public, cor_primaria, cor_secundaria, created_at, cup_seasons(id, numero, status)"
    )
    .eq("created_by", userId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Falha ao carregar suas copas: ${error.message}`)
  }

  const linhas = (data ?? []) as unknown as Array<{
    id: string
    nome: string
    abrangencia: CupScope
    formato: CupFormat
    status: CupCompetitionStatus
    is_public: boolean
    cor_primaria: string | null
    cor_secundaria: string | null
    cup_seasons: EdicaoEmbed[]
  }>

  return linhas.map((copa) => {
    // Edição corrente = a de maior numero (a "ponta" da cadeia).
    const corrente = [...copa.cup_seasons].sort((a, b) => b.numero - a.numero)[0]
    return {
      id: copa.id,
      nome: copa.nome,
      abrangencia: copa.abrangencia,
      formato: copa.formato,
      status: copa.status,
      isPublic: copa.is_public,
      corPrimaria: copa.cor_primaria,
      corSecundaria: copa.cor_secundaria,
      numEdicoes: copa.cup_seasons.length,
      edicaoAtual: corrente?.numero ?? null,
      statusEdicao: corrente?.status ?? null,
      edicaoAtualId: corrente?.id ?? null,
    }
  })
}
