"use server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getConfrontoDireto } from "@/features/league/data/getConfrontoDireto"
import type { ConfrontoDireto } from "@/features/standings/insights"

const paresSchema = z.object({
  competitorAId: z.uuid(),
  competitorBId: z.uuid(),
})

const VAZIO: ConfrontoDireto = {
  jogos: [],
  aVitorias: 0,
  empates: 0,
  bVitorias: 0,
  duploWo: 0,
  aDerrotas: 0,
  bDerrotas: 0,
  aGolsPro: 0,
  aGolsContra: 0,
}

/**
 * Server action de LEITURA (change add-insights-classificacao): carrega o
 * confronto direto entre dois competidores SOB DEMANDA quando o usuário escolhe
 * um rival no picker. É uma action (POST) — NÃO uma navegação nem um `<Link>`
 * prefetchável — evitando a rajada de prefetch RSC da classe do incidente 503. A
 * RLS de `matches` (dentro de `getConfrontoDireto`) é a barreira; ids inválidos
 * degradam para confronto vazio.
 */
export async function carregarConfrontoDireto(
  competitorAId: string,
  competitorBId: string
): Promise<ConfrontoDireto> {
  const parsed = paresSchema.safeParse({ competitorAId, competitorBId })
  if (!parsed.success) return VAZIO

  const supabase = await createClient()
  return getConfrontoDireto(supabase, parsed.data)
}
