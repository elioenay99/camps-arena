import { NextResponse } from "next/server"

import { renderTemporadaOg, type ClubeOg } from "@/features/og/temporada"
import { createClient } from "@/lib/supabase/server"

/**
 * Pôster "Temporada encerrada" (PNG) para o dono da liga compartilhar
 * (change add-conquistas-hall). Route Handler DINÂMICO sob /dashboard, restrito ao
 * DONO da liga (created_by). Lê os troféus PERSISTIDOS (`conquistas`) da temporada
 * — campeão da elite + promovidos/rebaixados — e resolve nome/escudo por join. 404
 * explícito (sem oráculo de existência) para quem não é dono, espelhando a rota da
 * imagem de rodada.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; seasonId: string }> }
): Promise<Response> {
  const { id, seasonId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  // Posse (dono da liga) + rótulo da temporada. `id` da URL deve bater com a
  // competição da season (evita pôster de temporada alheia sob outra liga).
  const { data: season } = await supabase
    .from("league_seasons")
    .select("numero, competition_id, league_competitions!inner ( id, nome, created_by )")
    .eq("id", seasonId)
    .maybeSingle()
  const comp = season?.league_competitions as unknown as
    | { id: string; nome: string; created_by: string | null }
    | null
  if (!season || !comp || comp.created_by !== user.id || comp.id !== id) {
    return new NextResponse(null, { status: 404 })
  }

  // Troféus persistidos da temporada (a RLS já os entrega ao dono).
  const { data: trofeus } = await supabase
    .from("conquistas")
    .select("tipo, nivel, competitor_id")
    .eq("escopo", "temporada")
    .eq("ref_id", seasonId)

  const linhas = trofeus ?? []
  const campeaoRow =
    linhas.find((t) => t.tipo === "campeao" && t.nivel === 1) ??
    linhas.find((t) => t.tipo === "campeao")
  const promovidosIds = linhas.filter((t) => t.tipo === "promovido").map((t) => t.competitor_id)
  const rebaixadosIds = linhas.filter((t) => t.tipo === "rebaixado").map((t) => t.competitor_id)

  const idsNecessarios = [
    ...new Set(
      [campeaoRow?.competitor_id, ...promovidosIds, ...rebaixadosIds].filter(
        (v): v is string => typeof v === "string"
      )
    ),
  ]

  // Resolve nome/escudo por join (não denormalizado): clube → teams; por-nome → rótulo.
  const clubePorId = new Map<string, ClubeOg>()
  if (idsNecessarios.length > 0) {
    const { data: comps } = await supabase
      .from("league_competitors")
      .select("id, rotulo, team:teams ( nome, escudo_url )")
      .in("id", idsNecessarios)
    for (const c of comps ?? []) {
      const team = c.team as unknown as { nome: string; escudo_url: string | null } | null
      clubePorId.set(c.id, {
        nome: team?.nome ?? c.rotulo ?? "Competidor",
        escudoUrl: team?.escudo_url ?? null,
      })
    }
  }
  const resolver = (compId: string | null | undefined): ClubeOg | null =>
    compId ? (clubePorId.get(compId) ?? null) : null

  return renderTemporadaOg({
    titulo: `${comp.nome} — Temporada ${season.numero}`,
    campeao: resolver(campeaoRow?.competitor_id),
    subiram: promovidosIds.map((cid) => resolver(cid)).filter((c): c is ClubeOg => c !== null),
    cairam: rebaixadosIds.map((cid) => resolver(cid)).filter((c): c is ClubeOg => c !== null),
  })
}
