import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { LeagueSeasonStatus } from "@/features/league/leagueStatus"
import type {
  TournamentFormat,
  TournamentStatus,
} from "@/lib/supabase/database.types"

/** Campos comuns a todo card da vitrine. */
interface ItemVitrineBase {
  id: string
  /** Link canônico para a visão de leitura. */
  href: string
  titulo: string
  corPrimaria: string | null
  corSecundaria: string | null
  /** Nome do dono (via view `users_public` — NUNCA PII). null = sem dono/anônimo. */
  dono: string | null
  /** Ordenação por recência (created_at da competição). */
  createdAt: string
}

/** Um item da vitrine: liga (pirâmide) ou torneio de topo. */
export type ItemVitrine =
  | (ItemVitrineBase & { tipo: "liga"; status: LeagueSeasonStatus })
  | (ItemVitrineBase & {
      tipo: "torneio"
      status: TournamentStatus
      formato: TournamentFormat
    })

interface SeasonEmbed {
  id: string
  numero: number
  status: LeagueSeasonStatus
}

/**
 * Vitrine pública (change add-vitrine-publica-e-compartilhar): agrega as
 * competições que o organizador optou por LISTAR (`listada=true`) — ligas
 * `ativa` e torneios `is_public` de TOPO (exclui divisões de pirâmide) — de
 * QUALQUER usuário. A visibilidade das linhas é da RLS (liga ativa / torneio
 * público são legíveis por qualquer logado); `listada` é só o flag de publicação.
 *
 * O nome do dono vem EXCLUSIVAMENTE da view `public.users_public` (id/nome) —
 * nunca de `auth.users`, nunca `celular`/PII (único vetor de PII da feature).
 */
export async function getVitrine(): Promise<ItemVitrine[]> {
  const supabase = await createClient()

  // Ligas listadas + ativas, com as temporadas para resolver a corrente (link).
  const { data: ligasRaw, error: ligasError } = await supabase
    .from("league_competitions")
    .select(
      "id, nome, created_by, created_at, cor_primaria, cor_secundaria, league_seasons(id, numero, status)"
    )
    .eq("listada", true)
    .eq("status", "ativa")
    // Teto DEFENSIVO (change mobile-nav-densidade): sem ORDER BY explícito aqui,
    // o limite não tem semântica de "as 60 melhores" — só impede que o payload
    // cresça sem limite. Não muda filtro nem ordenação.
    .limit(60)
  if (ligasError) {
    throw new Error(`Falha ao carregar a vitrine (ligas): ${ligasError.message}`)
  }

  // Torneios listados + públicos (candidatos; divisões são excluídas abaixo).
  const { data: torneiosRaw, error: torneiosError } = await supabase
    .from("tournaments")
    .select(
      "id, titulo, formato, status, created_by, created_at, cor_primaria, cor_secundaria"
    )
    .eq("listada", true)
    .eq("is_public", true)
    // Mesmo teto defensivo da query de ligas acima.
    .limit(60)
  if (torneiosError) {
    throw new Error(
      `Falha ao carregar a vitrine (torneios): ${torneiosError.message}`
    )
  }

  const ligas = (ligasRaw ?? []) as unknown as Array<{
    id: string
    nome: string
    created_by: string | null
    created_at: string
    cor_primaria: string | null
    cor_secundaria: string | null
    league_seasons: SeasonEmbed[]
  }>
  const torneios = (torneiosRaw ?? []) as unknown as Array<{
    id: string
    titulo: string
    formato: TournamentFormat
    status: TournamentStatus
    created_by: string | null
    created_at: string
    cor_primaria: string | null
    cor_secundaria: string | null
  }>

  // Exclui torneios que são DIVISÃO de pirâmide (referenciados por qualquer das 3
  // FKs de league_division_seasons). Belt-and-suspenders: o toggle já esconde a
  // opção em divisão, mas o loader nunca deixa uma divisão virar card avulso.
  let torneiosDeTopo = torneios
  if (torneios.length > 0) {
    const { data: divRefs, error: divError } = await supabase
      .from("league_division_seasons")
      .select("tournament_id, tournament_id_clausura, final_tournament_id")
    if (divError) {
      throw new Error(`Falha ao carregar a vitrine (divisões): ${divError.message}`)
    }
    const idsDivisao = new Set<string>()
    for (const r of divRefs ?? []) {
      if (r.tournament_id) idsDivisao.add(r.tournament_id)
      if (r.tournament_id_clausura) idsDivisao.add(r.tournament_id_clausura)
      if (r.final_tournament_id) idsDivisao.add(r.final_tournament_id)
    }
    torneiosDeTopo = torneios.filter((t) => !idsDivisao.has(t.id))
  }

  // Nomes dos donos via users_public (id/nome) — RESSALVA 2: só esta view, sem PII.
  const donoIds = [
    ...new Set(
      [
        ...ligas.map((l) => l.created_by),
        ...torneiosDeTopo.map((t) => t.created_by),
      ].filter((v): v is string => v !== null)
    ),
  ]
  const nomePorDono = new Map<string, string | null>()
  if (donoIds.length > 0) {
    const { data: donos, error: donosError } = await supabase
      .from("users_public")
      .select("id, nome")
      .in("id", donoIds)
    if (donosError) {
      throw new Error(`Falha ao carregar a vitrine (donos): ${donosError.message}`)
    }
    for (const d of donos ?? []) nomePorDono.set(d.id, d.nome)
  }

  const itens: ItemVitrine[] = []

  for (const l of ligas) {
    // Temporada corrente = maior numero (a "ponta" da cadeia). Sem season, omite.
    const corrente = [...l.league_seasons].sort((a, b) => b.numero - a.numero)[0]
    if (!corrente) continue
    itens.push({
      tipo: "liga",
      id: l.id,
      href: `/dashboard/ligas/${corrente.id}`,
      titulo: l.nome.trim() || "Pirâmide",
      status: corrente.status,
      corPrimaria: l.cor_primaria,
      corSecundaria: l.cor_secundaria,
      dono: l.created_by ? (nomePorDono.get(l.created_by) ?? null) : null,
      createdAt: l.created_at,
    })
  }

  for (const t of torneiosDeTopo) {
    itens.push({
      tipo: "torneio",
      id: t.id,
      href: `/dashboard/torneios/${t.id}`,
      titulo: t.titulo.trim() || "Torneio",
      status: t.status,
      formato: t.formato,
      corPrimaria: t.cor_primaria,
      corSecundaria: t.cor_secundaria,
      dono: t.created_by ? (nomePorDono.get(t.created_by) ?? null) : null,
      createdAt: t.created_at,
    })
  }

  // Mais recentes primeiro (created_at desc).
  itens.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return itens
}
