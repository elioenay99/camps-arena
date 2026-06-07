import "server-only"

import type { createClient } from "@/lib/supabase/server"

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/** Embed to-one da vaga (técnico atual) como o PostgREST devolve. */
type VagaTecnico = { user_id: string | null } | null

interface PartidaAbertaDaRodada {
  id: string
  vaga_1: string | null
  vaga_2: string | null
  v1: VagaTecnico
  v2: VagaTecnico
}

/**
 * Varre as partidas ABERTAS de uma rodada e resolve por W.O. AUTOMÁTICO as que
 * são órfão×técnico (um lado é clube sem técnico, o outro tem) — o lado com
 * técnico vence (0x0, wo_vencedor = a vaga com técnico). Partidas jogáveis
 * (ambos com técnico) e órfão×órfão NÃO são tocadas.
 *
 * `somenteSeRodadaCompleta` (fechamento AUTOMÁTICO, decisão 6): só varre quando
 * NÃO resta nenhuma partida jogável aberta — a rodada "fecha sozinha" quando o
 * último jogo entre clubes com técnico encerra. Sem o flag (botão "Fechar
 * rodada" do dono), varre incondicionalmente.
 *
 * Roda no contexto de quem ENCERRA (sempre o dono — encerrarPartida é dono-only)
 * ou do dono no `fecharRodada`; a RLS `matches_update_tournament_owner` é a
 * barreira. Helper, não Server Action — compartilhado por wo.ts e match.ts.
 * Best-effort: erros são logados e não derrubam o fluxo chamador.
 */
export async function varrerOrfaosDaRodada(
  supabase: SupabaseServer,
  tournamentId: string,
  rodada: number,
  opts: { somenteSeRodadaCompleta?: boolean } = {}
): Promise<{ marcadas: number }> {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, vaga_1, vaga_2,
       v1:tournament_slots!matches_vaga_1_fkey ( user_id ),
       v2:tournament_slots!matches_vaga_2_fkey ( user_id )`
    )
    .eq("tournament_id", tournamentId)
    .eq("rodada", rodada)
    .neq("status", "encerrada")

  if (error || !data) {
    if (error) {
      console.error("varrerOrfaosDaRodada: leitura falhou", error.code ?? error.message)
    }
    return { marcadas: 0 }
  }

  const abertas = data as unknown as PartidaAbertaDaRodada[]
  // Só partidas com os DOIS lados (vaga_1 e vaga_2): bye (vaga_2 null) já nasce
  // encerrado e nunca entra aqui; partida sem vagas é avulsa (sem rodada).
  const comDoisLados = abertas.filter((m) => m.vaga_1 !== null && m.vaga_2 !== null)
  const orfao1 = (m: PartidaAbertaDaRodada) => m.v1 == null || m.v1.user_id == null
  const orfao2 = (m: PartidaAbertaDaRodada) => m.v2 == null || m.v2.user_id == null
  const jogavel = (m: PartidaAbertaDaRodada) => !orfao1(m) && !orfao2(m)
  // Resolvível = EXATAMENTE um órfão (XOR): o lado com técnico vence.
  const resolvivel = (m: PartidaAbertaDaRodada) => orfao1(m) !== orfao2(m)

  if (opts.somenteSeRodadaCompleta && comDoisLados.some(jogavel)) {
    return { marcadas: 0 } // ainda há jogo real pendente: a rodada não fecha
  }

  let marcadas = 0
  for (const m of comDoisLados.filter(resolvivel)) {
    const vencedor = orfao1(m) ? m.vaga_2 : m.vaga_1
    const { data: ok, error: updErr } = await supabase
      .from("matches")
      .update({ wo: true, wo_vencedor: vencedor, placar_1: 0, placar_2: 0, status: "encerrada" })
      .eq("id", m.id)
      .neq("status", "encerrada")
      .select("id")
    if (updErr) {
      console.error("varrerOrfaosDaRodada: W.O. falhou", updErr.code ?? updErr.message)
      continue
    }
    if (ok && ok.length > 0) marcadas += 1
  }
  return { marcadas }
}
