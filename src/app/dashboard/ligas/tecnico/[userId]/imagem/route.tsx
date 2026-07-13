import { NextResponse } from "next/server"

import { getConquistasDoTecnico } from "@/features/league/data/getConquistasDoTecnico"
import { getTecnicoCampanha } from "@/features/league/data/getTecnicoCampanha"
import { getTecnicoProfile } from "@/features/league/data/getTecnicoProfile"
import { renderTecnicoOg } from "@/features/og/tecnico"
import { createClient } from "@/lib/supabase/server"

/**
 * Pôster PESSOAL do técnico (PNG) para qualquer logado compartilhar (change
 * add-frente-compartilhavel). Route Handler DINÂMICO sob /dashboard: exige SESSÃO,
 * sem posse — a carreira do técnico já é leitura pública a logados. `getTecnicoProfile`
 * é o GATE de existência (null ⇒ 404 sem oráculo) e a fonte de nome/foto; um técnico
 * REAL sem histórico visível (`clubes: []`) também vira 404 (mesmo gate do botão —
 * não serve pôster vazio por URL direta). Campanha + troféus alimentam o pôster.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
): Promise<Response> {
  const { userId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  const perfil = await getTecnicoProfile(supabase, { userId })
  // null = inexistente/ilegível; clubes vazio = sem histórico visível (pôster de nada).
  if (!perfil || perfil.clubes.length === 0) {
    return new NextResponse(null, { status: 404 })
  }

  const [campanha, conquistas] = await Promise.all([
    getTecnicoCampanha(supabase, { userId }),
    getConquistasDoTecnico(supabase, { userId }),
  ])

  return renderTecnicoOg({
    nome: perfil.nome,
    avatarUrl: perfil.avatar,
    campanha: campanha.total,
    conquistas,
  })
}
