import { NextResponse } from "next/server"

import { getPartidaParaImagem } from "@/features/match/data/getPartidaParaImagem"
import { renderPartidaOg } from "@/features/og/partida"
import { resolverCoresTorneio } from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"

/**
 * Imagem de RESULTADO de uma partida encerrada (PNG) para qualquer logado
 * compartilhar (change add-frente-compartilhavel). Route Handler DINÂMICO sob
 * /dashboard: exige SESSÃO mas NÃO checa posse — a imagem é montada com o cliente
 * Supabase DO USUÁRIO (anon+cookies), deixando a RLS decidir o acesso (decisão 2
 * do design). O fetcher projeta `tournament_id` e a rota EXIGE `=== id` da URL
 * (espelha o cross-check da rota de temporada): divergência, recurso ausente ou
 * rodada não liberada ao não-dono ⇒ 404 sem oráculo de existência.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
): Promise<Response> {
  const { id, matchId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  // Partida sob a RLS do usuário + cross-check do torneio da URL (não vaza cor/
  // contexto de torneio alheio, nem serve de oráculo).
  const partida = await getPartidaParaImagem(supabase, matchId)
  if (!partida || partida.tournament_id !== id) {
    return new NextResponse(null, { status: 404 })
  }

  // Título + cores do torneio (mesma RLS). resolverCoresTorneio cobre o fallback
  // de divisão (torneio que É uma divisão herda a cor da liga).
  const { data: torneio } = await supabase
    .from("tournaments")
    .select("id, titulo, cor_primaria, cor_secundaria")
    .eq("id", id)
    .maybeSingle()
  if (!torneio) return new NextResponse(null, { status: 404 })

  const cores = await resolverCoresTorneio(supabase, id, torneio)

  return renderPartidaOg({ partida, titulo: torneio.titulo, cores })
}
