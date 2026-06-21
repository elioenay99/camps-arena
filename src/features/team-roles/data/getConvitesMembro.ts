import "server-only"

import type { createClient } from "@/lib/supabase/server"
import type { Escopo, PapelConvite } from "@/schema/equipe"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type ConviteMembro = {
  /** Papel ofertado pelo link — só árbitro/moderador (admin nunca sai por link). */
  papel: PapelConvite
  /** Código do convite (a UI monta a URL /equipe/convite/<code>). */
  code: string
}

/**
 * Lista os convites de membro VIVOS de um campeonato (um link por papel). Só
 * code + papel — nada de PII nem metadados sensíveis. Server-only; a RLS de
 * leitura de `member_invites` é a barreira (gestores veem os links do seu
 * campeonato). Consumido pela UI de equipe para exibir/copiar os links ativos.
 */
export async function getConvitesMembro(
  supabase: ServerClient,
  escopo: Escopo,
  id: string
): Promise<ConviteMembro[]> {
  // `member_invites` é uma só tabela (ambas as colunas de alvo existem na Row);
  // o filtro `escopo` já discrimina, mas restringimos a coluna certa por precisão.
  const base = supabase.from("member_invites").select("papel, code").eq("escopo", escopo)
  const query = escopo === "tournament" ? base.eq("tournament_id", id) : base.eq("competition_id", id)

  const { data, error } = await query
  if (error || !data) {
    return []
  }

  // Só árbitro/moderador são ofertáveis por link; qualquer outra coisa é ruído
  // (admin nunca deveria existir aqui) — filtra para o union conhecido.
  return data
    .filter((c): c is { papel: PapelConvite; code: string } =>
      c.papel === "arbitro" || c.papel === "moderador"
    )
    .map((c) => ({ papel: c.papel, code: c.code }))
}
