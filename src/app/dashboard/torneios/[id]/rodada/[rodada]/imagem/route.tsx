import { NextResponse } from "next/server"

import { getPartidasDaRodada } from "@/features/match/data/getPartidasDaRodada"
import { renderRodadaOg } from "@/features/og/rodada"
import { resolverCoresTorneio } from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"

/**
 * Imagem da rodada (PNG) para o dono compartilhar no WhatsApp
 * (change add-compartilhar-rodada). Route Handler DINÂMICO, auth-gated pelo
 * proxy (vive sob /dashboard) e restrito ao DONO (created_by). Diferente do card
 * OG estático da marca: aqui é fetch autenticado do próprio dono, então pode ler
 * os dados (a RLS de matches lhe entrega a rodada). 404 explícito (não
 * `notFound()`, que é semântica de página) sem oráculo de existência.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; rodada: string }> }
): Promise<Response> {
  const { id, rodada } = await params
  const n = Number(rodada)
  if (!Number.isInteger(n) || n < 1) {
    return new NextResponse(null, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  // Posse + dados da imagem (título + cores) numa única viagem.
  const { data: torneio } = await supabase
    .from("tournaments")
    .select("id, titulo, cor_primaria, cor_secundaria")
    .eq("id", id)
    .eq("created_by", user.id)
    .maybeSingle()
  if (!torneio) return new NextResponse(null, { status: 404 })

  const [confrontos, cores] = await Promise.all([
    getPartidasDaRodada(supabase, id, n),
    resolverCoresTorneio(supabase, id, torneio),
  ])

  return renderRodadaOg({ titulo: torneio.titulo, rodada: n, confrontos, cores })
}
