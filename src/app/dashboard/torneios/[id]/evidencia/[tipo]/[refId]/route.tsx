import { NextResponse } from "next/server"
import { z } from "zod"

import { EVIDENCE_BUCKET } from "@/lib/evidence"
import { createClient } from "@/lib/supabase/server"

/**
 * Evidência de resultado (change add-proposta-resultado-foto). Rota auth-gated:
 * a RLS de cada tabela (`match_score_proposals` = aprovador/jogador;
 * `match_wo_requests` = solicitante/aprovador) só entrega a linha a quem pode ver
 * a foto — quem não vê a linha recebe 404 (sem oráculo). A imagem mora em bucket
 * PRIVADO; aqui geramos uma URL assinada de curta duração com o client da SESSÃO
 * (a policy SELECT do storage autoriza pelo `match_id` embutido no path) e
 * redirecionamos. Sem `service_role` no runtime, sem leitura pública.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; tipo: string; refId: string }> }
): Promise<Response> {
  const { tipo, refId } = await params
  if ((tipo !== "placar" && tipo !== "wo") || !z.uuid().safeParse(refId).success) {
    return new NextResponse(null, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 404 })

  let fotoPath: string | null = null
  if (tipo === "placar") {
    const { data } = await supabase
      .from("match_score_proposals")
      .select("foto_path")
      .eq("id", refId)
      .maybeSingle()
    fotoPath = data?.foto_path ?? null
  } else {
    const { data } = await supabase
      .from("match_wo_requests")
      .select("foto_path")
      .eq("id", refId)
      .maybeSingle()
    fotoPath = data?.foto_path ?? null
  }
  if (!fotoPath) return new NextResponse(null, { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(fotoPath, 60)
  if (error || !signed?.signedUrl) return new NextResponse(null, { status: 404 })

  return NextResponse.redirect(signed.signedUrl)
}
