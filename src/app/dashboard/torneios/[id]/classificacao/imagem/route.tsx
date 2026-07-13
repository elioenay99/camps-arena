import { NextResponse } from "next/server"

import { renderClassificacaoOg } from "@/features/og/classificacao"
import {
  getTournamentClassificacao,
  resolverCoresTorneio,
} from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"

/**
 * Imagem da CLASSIFICAÇÃO de um torneio de LIGA (PNG) para qualquer logado
 * compartilhar (change add-frente-compartilhavel). Route Handler DINÂMICO sob
 * /dashboard: exige SESSÃO, NÃO checa posse (a tabela é montada com o cliente do
 * usuário — a RLS decide; pode sair parcial ao não-dono). Restrita a
 * `formato === 'liga'` (pontos corridos) — grupos/mata-mata ficam de fora nesta
 * change. Recurso ausente/oculto pela RLS ⇒ 404 sem oráculo.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  const classificacao = await getTournamentClassificacao(id)
  if (!classificacao || classificacao.torneio.formato !== "liga") {
    return new NextResponse(null, { status: 404 })
  }

  const cores = await resolverCoresTorneio(supabase, id, classificacao.torneio)

  return renderClassificacaoOg({
    titulo: classificacao.torneio.titulo,
    linhas: classificacao.linhas,
    cores,
  })
}
