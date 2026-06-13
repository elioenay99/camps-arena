/**
 * Geração da 1ª fase de uma chave JÁ semeada + promoção rascunho→ativo. Server
 * helper (NÃO "use server": recebe o cliente Supabase como argumento, então não
 * pode ser uma Server Action). Extraído de `iniciarMataMata` para a montagem do
 * playoff de pirâmide (Fase 2) — diferença CRÍTICA: NÃO embaralha nem re-monta os
 * confrontos (o seeding por posição na liga é a essência do playoff), só recebe os
 * `confrontos` prontos. Preserva a ordem falha-segura (INSERT da chave ANTES do
 * UPDATE de status) e o tratamento de 23505 (corrida). Idempotente: recupera de
 * crash entre INSERT e UPDATE detectando partidas já geradas.
 */
import {
  gerarFaseInicial,
  type ConfrontoChave,
} from "@/features/knockout/gerarChaveMataMata"
import type { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type GerarChaveSemeadaResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Insere a 1ª fase da chave `confrontos` no torneio `tournamentId` e promove o
 * torneio de `rascunho` para `ativo`. Roda no contexto do DONO (a RLS de
 * `matches`/`tournaments` exige `created_by = auth.uid()`).
 */
export async function gerarChaveSemeada(
  supabase: SupabaseServerClient,
  tournamentId: string,
  confrontos: ConfrontoChave[],
  idaEVolta: boolean
): Promise<GerarChaveSemeadaResult> {
  const erroGenerico =
    "Não foi possível gerar a chave do playoff agora. Tente novamente."

  // Idempotência: se a chave já foi gerada (crash entre INSERT e UPDATE, ou
  // retomada parcial da montagem), pula o INSERT e só promove o status.
  const { data: jaGeradas, error: jaError } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .not("rodada", "is", null)
    .limit(1)
  if (jaError) {
    return { ok: false, error: erroGenerico }
  }

  if (!jaGeradas || jaGeradas.length === 0) {
    // Lados por VAGA (slot ids): participante_1/2 do confronto carregam os slot
    // ids → vaga_1/vaga_2. Bye nasce 'encerrada' 0x0 (memória durável do slot).
    const partidas = gerarFaseInicial(confrontos, idaEVolta).map((p) => ({
      tournament_id: tournamentId,
      vaga_1: p.participante_1,
      vaga_2: p.participante_2,
      rodada: p.rodada,
      posicao: p.posicao,
      perna: p.perna,
      ...(p.bye ? { status: "encerrada" as const } : {}),
    }))
    const { error: insertError } = await supabase.from("matches").insert(partidas)
    // 23505 = perdedor da corrida (matches_mata_mata_slot_unico): a outra aba já
    // gerou a chave — segue para promover (estado correto, idempotente).
    if (insertError && insertError.code !== "23505") {
      console.error(
        "gerarChaveSemeada: geração falhou",
        insertError.code ?? insertError.message
      )
      return { ok: false, error: erroGenerico }
    }
  }

  // Promove rascunho→ativo. Idempotente: já 'ativo' ⇒ 0 linhas, sem erro. A RLS
  // (tournaments_update_owner) restringe ao dono; o trigger de freeze não barra
  // rascunho→ativo (só encerrado→ativo/rascunho).
  const { error: updateError } = await supabase
    .from("tournaments")
    .update({ status: "ativo" })
    .eq("id", tournamentId)
    .eq("status", "rascunho")
  if (updateError) {
    return { ok: false, error: erroGenerico }
  }

  return { ok: true }
}
