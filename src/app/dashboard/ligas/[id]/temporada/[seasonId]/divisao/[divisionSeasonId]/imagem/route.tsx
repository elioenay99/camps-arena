import { NextResponse } from "next/server"

import { resolverCores } from "@/features/championship/championshipTheme"
import { getDivisionStandings } from "@/features/league/data/getDivisionStandings"
import { getSeason } from "@/features/league/data/getSeason"
import { renderClassificacaoOg } from "@/features/og/classificacao"
import { createClient } from "@/lib/supabase/server"

/**
 * Imagem da CLASSIFICAÇÃO de uma DIVISÃO de pirâmide (PNG) para qualquer logado
 * compartilhar (change add-frente-compartilhavel). Segmento NOVO na árvore
 * `ligas/[id]/temporada/[seasonId]` ([id] = competição, espelhando a rota de
 * temporada). Auth-gated (sessão), sem posse: a tabela é montada com o cliente do
 * usuário e a RLS decide. `getSeason` dá as fronteiras; `getDivisionStandings` LÊ
 * o `.zonas` já pronto do retorno (não recomputa `derivarZonas`) e cobre o split
 * combinado. Recurso ausente/oculto/divergente ⇒ 404 sem oráculo.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; seasonId: string; divisionSeasonId: string }>
  }
): Promise<Response> {
  const { id, seasonId, divisionSeasonId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  // Temporada (fronteiras + identidade/cores) + cross-check da competição da URL.
  const temporada = await getSeason(seasonId, user.id)
  if (!temporada || temporada.competicao.id !== id) {
    return new NextResponse(null, { status: 404 })
  }
  const divisao = temporada.divisoes.find((d) => d.id === divisionSeasonId)
  if (!divisao) return new NextResponse(null, { status: 404 })

  // Classificação da divisão sob a RLS do usuário; LÊ o `.zonas` já resolvido
  // (embute as fronteiras de playoff que o caller não tem) e a anual COMBINADA no split.
  const standings = await getDivisionStandings(
    divisionSeasonId,
    user.id,
    temporada.fronteiras
  )
  if (!standings) return new NextResponse(null, { status: 404 })

  // Cor da divisão (própria ?? competição ?? base), como a página.
  const cores = resolverCores(
    { cor_primaria: divisao.corPrimaria, cor_secundaria: divisao.corSecundaria },
    {
      cor_primaria: temporada.competicao.corPrimaria,
      cor_secundaria: temporada.competicao.corSecundaria,
    }
  )

  const nomeDivisao = divisao.nome.trim() || `Divisão ${divisao.nivel}`
  const titulo = `${temporada.competicao.nome.trim() || "Pirâmide"} — ${nomeDivisao}`

  return renderClassificacaoOg({
    titulo,
    linhas: standings.linhas,
    zonas: standings.zonas,
    cores,
  })
}
