"use server"

import { apiFootballKey } from "@/lib/env"
import { rehospedarEscudo } from "@/lib/escudos"
import { createClient } from "@/lib/supabase/server"
import {
  selectTeamSchema,
  teamSearchSchema,
  type SelectTeamInput,
  type TeamResult,
} from "@/schema/teamSchema"

const API_BASE = "https://v3.football.api-sports.io"
const PROVIDER = "api-football"

export type SearchTeamsResult =
  | { ok: true; teams: TeamResult[] }
  | { ok: false; error: string }

export type SelectTeamResult =
  | { ok: true; teamId: string }
  | { ok: false; error: string }

/** Extrai `response[].team` do payload da API-Football em clubes normalizados. */
function normalizar(json: unknown): TeamResult[] {
  if (!json || typeof json !== "object") return []
  const response = (json as { response?: unknown }).response
  if (!Array.isArray(response)) return []

  const teams: TeamResult[] = []
  for (const item of response) {
    const team = (item as { team?: { id?: unknown; name?: unknown; logo?: unknown } })?.team
    if (!team) continue
    const { id, name, logo } = team
    if ((typeof id !== "number" && typeof id !== "string") || typeof name !== "string") {
      continue
    }
    teams.push({
      externalId: String(id),
      nome: name,
      escudoUrl: typeof logo === "string" && logo.length > 0 ? logo : null,
    })
  }
  return teams
}

/**
 * Busca clubes reais por nome na API-Football. A chave fica só no servidor
 * (`API_FOOTBALL_KEY`, sem `NEXT_PUBLIC_`). Termo < 3 chars → lista vazia
 * (sem chamada). Erros são tratados sem vazar detalhes ao cliente.
 *
 * Exige sessão autenticada: como Server Actions são endpoints HTTP, uma action
 * pública poderia ser chamada por POST direto para esgotar a cota grátis
 * (~100/dia) anonimamente. O único caller de UI é o modal autenticado.
 *
 * Proteção do limite grátis: `next.revalidate` cacheia a resposta por URL (não
 * por usuário) — vários autenticados que buscam o mesmo termo compartilham o
 * cache de 24h, o que é correto (lista de clubes é dado público). O debounce do
 * autocomplete e o cache em `teams` (selectTeam) complementam.
 */
export async function searchTeams(query: string): Promise<SearchTeamsResult> {
  const parsed = teamSearchSchema.safeParse(query)
  if (!parsed.success) {
    return { ok: true, teams: [] }
  }

  // Identidade — fecha o vetor de esgotar a cota anonimamente.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const apiKey = apiFootballKey()
  if (!apiKey) {
    console.error("API_FOOTBALL_KEY ausente — busca de clubes indisponível.")
    return { ok: false, error: "Busca de clubes indisponível no momento." }
  }

  let resposta: Response
  try {
    resposta = await fetch(
      `${API_BASE}/teams?search=${encodeURIComponent(parsed.data)}`,
      {
        headers: { "x-apisports-key": apiKey },
        next: { revalidate: 60 * 60 * 24 },
        // Falha graciosa em vez de travar a UI se a API pendurar.
        signal: AbortSignal.timeout(8000),
      }
    )
  } catch (erro) {
    console.error("Falha de rede na busca de clubes", erro)
    return { ok: false, error: "Não foi possível buscar clubes agora." }
  }

  if (!resposta.ok) {
    console.error("API-Football respondeu", resposta.status)
    return { ok: false, error: "Não foi possível buscar clubes agora." }
  }

  let json: unknown
  try {
    json = await resposta.json()
  } catch {
    return { ok: false, error: "Resposta inválida da busca de clubes." }
  }

  // A API responde 200 com `errors` preenchido em caso de cota/chave inválida.
  const errors = (json as { errors?: unknown }).errors
  if (
    errors &&
    ((Array.isArray(errors) && errors.length > 0) ||
      (typeof errors === "object" && Object.keys(errors as object).length > 0))
  ) {
    console.error("API-Football retornou erros", errors)
  }

  return { ok: true, teams: normalizar(json) }
}

/**
 * Persiste (cache) o clube escolhido em `teams`, idempotente por
 * `provider + external_id`, e retorna o id local. Exige sessão (RLS de
 * `teams` só permite INSERT a autenticados).
 */
export async function selectTeam(input: SelectTeamInput): Promise<SelectTeamResult> {
  const parsed = selectTeamSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Clube inválido." }
  }
  const { externalId, nome, escudoUrl } = parsed.data

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // Já cacheado? (idempotência por provider + external_id)
  const { data: existente, error: selErr } = await supabase
    .from("teams")
    .select("id")
    .eq("provider", PROVIDER)
    .eq("external_id", externalId)
    .maybeSingle()
  if (selErr) {
    return { ok: false, error: "Não foi possível salvar o clube." }
  }
  if (existente) {
    return { ok: true, teamId: existente.id }
  }

  // Self-hosta o escudo ANTES de inserir: `teams` não tem policy de UPDATE via
  // RLS (só INSERT idempotente), então a URL final precisa entrar já na
  // inserção. Best-effort — falha devolve a URL de origem (fallback), nunca
  // bloqueia o cache do clube. Só para clube novo (o `existente` acima já
  // retornou), garantindo idempotência (não re-hospeda o que já está cacheado).
  const escudoFinal = escudoUrl ? await rehospedarEscudo(supabase, externalId, escudoUrl) : null

  const { data: inserido, error: insErr } = await supabase
    .from("teams")
    .insert({ nome, escudo_url: escudoFinal, external_id: externalId, provider: PROVIDER })
    .select("id")
    .single()

  if (insErr || !inserido) {
    // Corrida: inserção concorrente do mesmo clube viola o unique → relê.
    const { data: relido } = await supabase
      .from("teams")
      .select("id")
      .eq("provider", PROVIDER)
      .eq("external_id", externalId)
      .maybeSingle()
    if (relido) {
      return { ok: true, teamId: relido.id }
    }
    return { ok: false, error: "Não foi possível salvar o clube." }
  }

  return { ok: true, teamId: inserido.id }
}
