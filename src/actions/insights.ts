"use server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getConfrontoDireto } from "@/features/league/data/getConfrontoDireto"
import { getConfrontoTecnicos } from "@/features/league/data/getConfrontoTecnicos"
import type { ConfrontoDireto } from "@/features/standings/insights"

const paresSchema = z.object({
  competitorAId: z.uuid(),
  competitorBId: z.uuid(),
})

const paresTecnicosSchema = z.object({
  userAId: z.uuid(),
  userBId: z.uuid(),
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

/**
 * Server action de LEITURA (change add-perfil-tecnico-carreira): carrega o
 * confronto direto entre dois TÉCNICOS (por `users.id`) SOB DEMANDA quando o
 * usuário escolhe um adversário no picker do perfil do técnico. POST (não uma
 * navegação prefetchável), mesmo padrão de `carregarConfrontoDireto`. Valida os
 * dois uuids e rejeita auto-confronto (A==B) cedo → retorno vazio; a RLS de
 * `matches`/`coach_tenures` (dentro de `getConfrontoTecnicos`) é a barreira.
 */
export async function carregarConfrontoTecnicos(
  userAId: string,
  userBId: string
): Promise<ConfrontoDireto> {
  const parsed = paresTecnicosSchema.safeParse({ userAId, userBId })
  if (!parsed.success || parsed.data.userAId === parsed.data.userBId) return VAZIO

  const supabase = await createClient()
  return getConfrontoTecnicos(supabase, parsed.data)
}
