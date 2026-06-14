import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  gerarPartidasGrupos,
  montarGruposSorteio,
  validarGeometria,
} from "@/features/groups/gerarFaseDeGrupos"
import type { RandInt } from "@/features/knockout/gerarChaveMataMata"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Há alguma partida de FASE DE GRUPOS ainda não encerrada neste torneio? Gate
 * compartilhado (Fase 5.2): o sobe/cai de uma divisão `grupos_mata_mata` vem do
 * AGREGADO da fase de grupos — `encerrarTorneio` só seta o status (não exige
 * jogos completos), então é preciso checar à parte que TODOS os jogos de grupo
 * (`grupo` IS NOT NULL) estão encerrados antes de calcular o fluxo OU montar
 * playoffs/barragem (senão o agregado/seeding sai PARCIAL). `null` em erro de IO.
 */
export async function faseDeGruposIncompleta(
  supabase: Supabase,
  tournamentId: string
): Promise<boolean | null> {
  const { count, error } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .not("grupo", "is", null)
    .neq("status", "encerrada")
  if (error) return null
  return (count ?? 0) > 0
}

/**
 * Gera a FASE DE GRUPOS de um torneio de divisão de pirâmide (formato
 * `grupos_mata_mata`) por SORTEIO SEMEADO (determinístico/auditável), espelhando
 * o núcleo de `iniciarTorneioGrupos` (guard de idempotência, recuperação de
 * crash, promoção atômica, INSERT em lote) MAS sem a UI/FormData e sem regravar
 * `classificados_por_grupo` — esse K já foi gravado na CRIAÇÃO pela RPC
 * `montar_temporada` (fonte única). O `randInt` é injetado pelo chamador (a
 * pirâmide passa um adapter semeado pelo id da temporada+divisão).
 *
 * Idempotente: se as partidas de grupo já existem, é no-op `ok`. Recebe o
 * `supabase` por argumento (NÃO é Server Action).
 */
export async function gerarFaseGruposSemeada(
  supabase: Supabase,
  tournamentId: string,
  opts: {
    qtdGrupos: number
    classificadosPorGrupo: number
    idaEVolta: boolean
    randInt: RandInt
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const erroGenerico = "Não foi possível iniciar a divisão agora. Tente novamente."

  const { data: torneio, error: tErr } = await supabase
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .maybeSingle()
  if (tErr || !torneio) return { ok: false, error: erroGenerico }

  // Idempotência: se já há partidas com rodada (fase de grupos gerada), no-op
  // (espelha `iniciarTorneioGrupos`; o filtro `rodada IS NOT NULL` ignora
  // partidas de mata-mata sem rodada que possam vir a existir).
  const { data: jaGeradas, error: jgErr } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .not("rodada", "is", null)
    .limit(1)
  if (jgErr) return { ok: false, error: erroGenerico }
  if (jaGeradas && jaGeradas.length > 0) return { ok: true }

  // Recuperação de crash: 'ativo' sem partidas ⇒ rebaixa atomicamente p/ refazer.
  if (torneio.status === "ativo") {
    const { data: rebaixado, error: rErr } = await supabase
      .from("tournaments")
      .update({ status: "rascunho" })
      .eq("id", tournamentId)
      .eq("status", "ativo")
      .select("id")
    if (rErr) return { ok: false, error: erroGenerico }
    if (!rebaixado || rebaixado.length === 0) {
      return { ok: false, error: "A divisão pode ter mudado. Recarregue e tente de novo." }
    }
  } else if (torneio.status !== "rascunho") {
    return { ok: false, error: "Esta divisão não está em rascunho." }
  }

  const { data: vagas, error: vErr } = await supabase
    .from("tournament_slots")
    .select("id")
    .eq("tournament_id", tournamentId)
  if (vErr) return { ok: false, error: erroGenerico }
  // Base canônica determinística: ordena por slot id; a aleatoriedade vem SÓ do
  // randInt semeado (mesma seed ⇒ mesma partição).
  const participantes = (vagas ?? []).map((v) => v.id).sort()

  let grupos: string[][]
  try {
    validarGeometria(participantes.length, opts.qtdGrupos, opts.classificadosPorGrupo)
    grupos = montarGruposSorteio(participantes, opts.qtdGrupos, opts.randInt)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : erroGenerico }
  }

  // Promoção atômica ANTES do INSERT (serializa corridas). NÃO regrava K.
  const { data: promovido, error: pErr } = await supabase
    .from("tournaments")
    .update({ status: "ativo" })
    .eq("id", tournamentId)
    .eq("status", "rascunho")
    .select("id")
  if (pErr) return { ok: false, error: erroGenerico }
  if (!promovido || promovido.length === 0) {
    return { ok: false, error: "A divisão já foi iniciada (talvez em outra aba). Recarregue." }
  }

  const partidas = gerarPartidasGrupos(grupos, opts.idaEVolta).map((p) => ({
    tournament_id: tournamentId,
    vaga_1: p.participante_1,
    vaga_2: p.participante_2,
    grupo: p.grupo,
    rodada: p.rodada,
  }))
  const { error: insErr } = await supabase.from("matches").insert(partidas)
  if (insErr) {
    console.error("gerarFaseGruposSemeada: insert", insErr.code ?? insErr.message)
    return { ok: false, error: erroGenerico }
  }
  return { ok: true }
}
