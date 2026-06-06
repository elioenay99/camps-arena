"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import {
  createMatchSchema,
  updateMatchScoreSchema,
  updateMatchTeamsSchema,
  type UpdateMatchScoreInput,
  type UpdateMatchTeamsInput,
} from "@/schema/matchSchema"

export type UpdateMatchScoreResult =
  | { ok: true }
  | {
      ok: false
      error: string
      fieldErrors?: Record<string, string[] | undefined>
    }

/**
 * Atualiza o placar de uma partida.
 *
 * Segurança em profundidade (a Server Action é alcançável por POST direto,
 * não só pela UI — ver docs do Next 16):
 *   1. Valida a entrada com Zod.
 *   2. Confere a identidade via `auth.getUser()` (valida o JWT no servidor de
 *      auth; não confia apenas no cookie como `getSession`).
 *   3. Verifica a PROPRIEDADE: o usuário precisa ser participante_1 ou
 *      participante_2 da partida — caso contrário, rejeita.
 *   4. O UPDATE só toca colunas de placar; a RLS (`matches_update_participant`)
 *      é a segunda barreira e o `select()` confirma que uma linha foi afetada.
 */
export async function updateMatchScore(
  input: UpdateMatchScoreInput
): Promise<UpdateMatchScoreResult> {
  const parsed = updateMatchScoreSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Placar inválido.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }
  const { matchId, placar_1, placar_2 } = parsed.data

  const supabase = await createClient()

  // 1) Identidade — valida a sessão no servidor de auth.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // 2) Propriedade — carrega a partida e confere se o usuário participa dela.
  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select("id, participante_1, participante_2, status, tournament_id")
    .eq("id", matchId)
    .maybeSingle()

  if (fetchError) {
    return { ok: false, error: "Não foi possível carregar a partida." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }

  const ehParticipante =
    user.id === match.participante_1 || user.id === match.participante_2
  if (!ehParticipante) {
    return { ok: false, error: "Você não participa desta partida." }
  }

  // Encerrada é imutável (mensagem precisa; o trigger lock_match_lifecycle é
  // a barreira final contra POST direto). Correção: dono reabre antes.
  if (match.status === "encerrada") {
    return {
      ok: false,
      error: "Partida encerrada não aceita placar. Peça ao dono do torneio para reabri-la.",
    }
  }

  // 3) UPDATE — apenas placares (não dispara o trigger de trava de relações).
  //    `.select()` confirma a escrita: se a RLS barrar ou a partida sumir
  //    entre a checagem e o update, nenhuma linha volta.
  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update({ placar_1, placar_2 })
    .eq("id", matchId)
    .select("id")

  if (updateError) {
    return { ok: false, error: "Não foi possível salvar o placar." }
  }
  if (!atualizada || atualizada.length === 0) {
    // Propriedade já foi confirmada acima: 0 linhas aqui indica corrida
    // (partida alterada/removida entre a checagem e o update) ou RLS — não
    // falta de propriedade. Mensagem distinta evita diagnóstico enganoso.
    return {
      ok: false,
      error: "Não foi possível salvar o placar. A partida pode ter sido alterada. Tente novamente.",
    }
  }

  // A página do torneio também exibe placar ao vivo (partidas em aberto,
  // classificação) — revalidar as DUAS rotas.
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  return { ok: true }
}

export type CreateMatchFormState = {
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

/**
 * Cria uma partida em um torneio do PRÓPRIO usuário (form action, segue o
 * padrão de `createTournament`). Segurança em profundidade:
 *   1. Sessão via `auth.getUser()`.
 *   2. Propriedade conferida por FILTRO no servidor (`created_by = user.id` +
 *      `status <> 'encerrado'`) — "não achou" vira mensagem única, sem oráculo
 *      de existência de torneio privado alheio.
 *   3. INSERT envia SÓ tournament_id/participante_1/participante_2 (status e
 *      placares ficam com os defaults do banco); a RLS
 *      (`matches_insert_tournament_owner`) é a segunda barreira.
 */
export async function createMatch(
  _prevState: CreateMatchFormState,
  formData: FormData
): Promise<CreateMatchFormState> {
  // Select nativo: opção "Definir depois" envia "" → null.
  const participanteOuNull = (campo: string) => {
    const valor = formData.get(campo)
    return typeof valor === "string" && valor !== "" ? valor : null
  }

  const parsed = createMatchSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    participante1: participanteOuNull("participante1"),
    participante2: participanteOuNull("participante2"),
  })
  if (!parsed.success) {
    return {
      error: "Verifique os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: "Sessão expirada. Entre novamente para criar uma partida." }
  }

  try {
    // Propriedade + lifecycle: `.neq` falha-segura (rascunho aceita partidas;
    // status futuro não bloqueia silenciosamente) — espelha a policy de INSERT.
    const { data: torneio, error: fetchError } = await supabase
      .from("tournaments")
      .select("id, formato")
      .eq("id", parsed.data.tournamentId)
      .eq("created_by", user.id)
      .neq("status", "encerrado")
      .maybeSingle()
    if (fetchError) {
      return { error: "Não foi possível criar a partida agora. Tente novamente." }
    }
    if (!torneio) {
      return {
        error: "Torneio não encontrado, encerrado ou você não é o dono dele.",
      }
    }
    // Formato GERADO (liga, mata-mata) não aceita partida manual: tabela/chave
    // nascem ao iniciar (mensagem precisa — o torneio é do próprio dono, não
    // há oráculo a proteger). `!== "avulso"` é falha-seguro: formato futuro
    // gerado herda o bloqueio. Espelha a cláusula de formato da policy
    // matches_insert_tournament_owner.
    if (torneio.formato !== "avulso") {
      return {
        error:
          "Este formato de torneio não aceita partida manual — as partidas são geradas ao iniciar o torneio.",
      }
    }

    // Consentimento: cada participante informado precisa estar na lista de
    // participantes CONFIRMADOS do torneio (entrou pelo convite). Espelha a
    // cláusula da policy matches_insert_tournament_owner — aqui a mensagem é
    // precisa; o banco é a segunda barreira.
    const informados = [parsed.data.participante1, parsed.data.participante2]
      .filter((id): id is string => id !== null)
    if (informados.length > 0) {
      const { data: confirmados, error: participantesError } = await supabase
        .from("participants")
        .select("user_id")
        .eq("tournament_id", parsed.data.tournamentId)
        .in("user_id", informados)
      if (participantesError) {
        return { error: "Não foi possível criar a partida agora. Tente novamente." }
      }
      const confirmadosSet = new Set((confirmados ?? []).map((p) => p.user_id))
      if (!informados.every((id) => confirmadosSet.has(id))) {
        return {
          error: "Selecione apenas participantes confirmados do torneio.",
        }
      }
    }

    const { error } = await supabase.from("matches").insert({
      tournament_id: parsed.data.tournamentId,
      participante_1: parsed.data.participante1,
      participante_2: parsed.data.participante2,
    })
    if (error) {
      console.error("createMatch falhou", error.code ?? error.message)
      return { error: "Não foi possível criar a partida agora. Tente novamente." }
    }
  } catch {
    return { error: "Não foi possível criar a partida agora. Tente novamente." }
  }

  // redirect() fora do try/catch (lança NEXT_REDIRECT). Destino: a página do
  // torneio — é onde a partida recém-criada aparece (em aberto).
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${parsed.data.tournamentId}`)
  redirect(`/dashboard/torneios/${parsed.data.tournamentId}`)
}

export type UpdateMatchTeamsResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Associa o clube de um (ou ambos) os lados da partida. Mesma autorização por
 * propriedade da `updateMatchScore` (o participante é o usuário). Não dispara o
 * trigger `lock_match_relations`, que só trava participantes/torneio — `time_1/2`
 * são identidade cosmética e editáveis pelo participante.
 */
export async function updateMatchTeams(
  input: UpdateMatchTeamsInput
): Promise<UpdateMatchTeamsResult> {
  const parsed = updateMatchTeamsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Dados de clube inválidos." }
  }
  const { matchId, time_1, time_2 } = parsed.data

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select("id, participante_1, participante_2, time_1, time_2, status, tournament_id")
    .eq("id", matchId)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: "Não foi possível carregar a partida." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }

  const ehParticipante =
    user.id === match.participante_1 || user.id === match.participante_2
  if (!ehParticipante) {
    return { ok: false, error: "Você não participa desta partida." }
  }

  // Clube alimenta a CLASSIFICAÇÃO DE CLUBES — em partida encerrada ele é tão
  // imutável quanto o placar (trigger lock_match_lifecycle é a barreira final).
  if (match.status === "encerrada") {
    return {
      ok: false,
      error: "Partida encerrada não aceita alteração de clube. Peça ao dono do torneio para reabri-la.",
    }
  }

  // Rejeita o mesmo clube nos dois lados (estado atual sobrescrito pelo patch).
  const time1Final = time_1 !== undefined ? time_1 : (match.time_1 ?? null)
  const time2Final = time_2 !== undefined ? time_2 : (match.time_2 ?? null)
  if (time1Final !== null && time2Final !== null && time1Final === time2Final) {
    return { ok: false, error: "Os dois lados não podem ter o mesmo clube." }
  }

  // Aplica só os lados informados (undefined = não mexe).
  const patch: { time_1?: string | null; time_2?: string | null } = {}
  if (time_1 !== undefined) patch.time_1 = time_1
  if (time_2 !== undefined) patch.time_2 = time_2

  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update(patch)
    .eq("id", matchId)
    .select("id")
  if (updateError) {
    return { ok: false, error: "Não foi possível salvar o clube." }
  }
  if (!atualizada || atualizada.length === 0) {
    return { ok: false, error: "Você não participa desta partida." }
  }

  // Clube alimenta a página do torneio (classificação de clubes) também.
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  return { ok: true }
}

export type MatchLifecycleResult = { ok: true } | { ok: false; error: string }

/**
 * Transição de status executada pelo DONO do torneio (modelo árbitro).
 * Segurança em profundidade: sessão + propriedade do TORNEIO conferida por
 * FILTRO no servidor (resposta única, sem oráculo) + RLS
 * (`matches_update_tournament_owner`) + trigger `lock_match_lifecycle` como
 * barreira final contra POST direto.
 */
async function mudarStatusComoDono(
  matchId: unknown,
  opts: {
    /** A transição só vale a partir deste predicado sobre o status atual. */
    podePartirDe: (status: string) => boolean
    erroTransicao: string
    novoStatus: "encerrada" | "em_andamento"
    erroGenerico: string
  }
): Promise<MatchLifecycleResult> {
  const parsed = z.uuid().safeParse(matchId)
  if (!parsed.success) {
    return { ok: false, error: "Partida inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // Partida (status atual + torneio dela + insumos das regras de mata-mata).
  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select(
      "id, status, tournament_id, rodada, posicao, perna, participante_1, participante_2, placar_1, placar_2"
    )
    .eq("id", parsed.data)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: opts.erroGenerico }
  }

  // Propriedade do TORNEIO por filtro — partida inexistente, invisível, de
  // torneio alheio OU de torneio encerrado recebem a MESMA resposta (sem
  // oráculo). Torneio encerrado congela o lifecycle das partidas: reabrir ali
  // seria beco sem saída (a partida some do dashboard e de toda edição).
  const erroPropriedade =
    "Partida não encontrada, torneio encerrado ou você não é o dono dele."
  if (!match) {
    return { ok: false, error: erroPropriedade }
  }
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, formato")
    .eq("id", match.tournament_id)
    .eq("created_by", user.id)
    .neq("status", "encerrado")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: opts.erroGenerico }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }

  if (!opts.podePartirDe(match.status)) {
    return { ok: false, error: opts.erroTransicao }
  }

  // Regras de eliminatória (mensagem precisa; o trigger
  // valida_resultado_mata_mata é a barreira final contra POST direto).
  if (torneio.formato === "mata_mata" && match.rodada !== null) {
    const erro = await validarLifecycleMataMata(supabase, match, opts.novoStatus)
    if (erro) {
      return { ok: false, error: erro }
    }
  }

  // `.select()` confirma a escrita: corrida (status mudou entre a checagem e
  // o update) ou RLS derrubam para 0 linhas.
  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update({ status: opts.novoStatus })
    .eq("id", parsed.data)
    .select("id")
  if (updateError) {
    return { ok: false, error: opts.erroGenerico }
  }
  if (!atualizada || atualizada.length === 0) {
    return {
      ok: false,
      error: "A partida pode ter sido alterada. Recarregue e tente novamente.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  return { ok: true }
}

/**
 * Regras de lifecycle específicas do mata-mata (partida com rodada em torneio
 * `mata_mata`). Devolve a mensagem de erro ou null quando a transição é
 * válida. Espelha o trigger `valida_resultado_mata_mata` (banco = backstop):
 *   - encerrar jogo único exige vencedor (eliminatória não empata);
 *   - encerrar a volta exige a ida encerrada e agregado desempatado
 *     (a volta tem lados invertidos: agregado A = ida.placar_1 + volta.placar_2);
 *   - bye nunca reabre (não há placar a corrigir);
 *   - fase posterior gerada congela as anteriores (o vencedor já foi semeado).
 */
async function validarLifecycleMataMata(
  supabase: Awaited<ReturnType<typeof createClient>>,
  match: {
    tournament_id: string
    rodada: number | null
    posicao: number | null
    perna: number | null
    participante_1: string | null
    participante_2: string | null
    placar_1: number
    placar_2: number
  },
  novoStatus: "encerrada" | "em_andamento"
): Promise<string | null> {
  const erroGenerico = "Não foi possível validar o confronto. Tente novamente."

  if (novoStatus === "encerrada") {
    // Bye (lado nulo) nasce encerrado — não há placar a validar.
    if (match.participante_1 === null || match.participante_2 === null) {
      return null
    }
    if (match.perna === null) {
      if (match.placar_1 === match.placar_2) {
        return "Jogo decisivo de mata-mata não pode terminar empatado. Inclua a decisão (prorrogação/pênaltis) no placar."
      }
      return null
    }
    if (match.perna === 2) {
      const { data: ida, error } = await supabase
        .from("matches")
        .select("status, placar_1, placar_2")
        .eq("tournament_id", match.tournament_id)
        .eq("rodada", match.rodada as number)
        .eq("posicao", match.posicao as number)
        .eq("perna", 1)
        .maybeSingle()
      if (error) {
        return erroGenerico
      }
      if (!ida || ida.status !== "encerrada") {
        return "Encerre o jogo de ida antes do jogo de volta."
      }
      if (ida.placar_1 + match.placar_2 === ida.placar_2 + match.placar_1) {
        return "Agregado empatado: o placar da volta deve incluir a decisão (prorrogação/pênaltis)."
      }
    }
    if (match.perna === 1) {
      // Re-encerramento da ida com a volta JÁ fechada (fluxo reabrir →
      // corrigir → re-encerrar): revalida o agregado completo — sem isso o
      // slot persistiria "fechado" com agregado empatado e o avanço de fase
      // recusaria sem explicar. Volta ainda aberta/inexistente segue livre.
      const { data: volta, error } = await supabase
        .from("matches")
        .select("status, placar_1, placar_2")
        .eq("tournament_id", match.tournament_id)
        .eq("rodada", match.rodada as number)
        .eq("posicao", match.posicao as number)
        .eq("perna", 2)
        .maybeSingle()
      if (error) {
        return erroGenerico
      }
      if (
        volta &&
        volta.status === "encerrada" &&
        match.placar_1 + volta.placar_2 === match.placar_2 + volta.placar_1
      ) {
        return "Agregado empatado: corrija o placar antes de encerrar (prorrogação/pênaltis no jogo de volta)."
      }
    }
    return null
  }

  // Reabertura.
  if (match.participante_1 === null || match.participante_2 === null) {
    return "Partida de avanço direto (bye) não pode ser reaberta."
  }
  const { data: posteriores, error } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", match.tournament_id)
    .gt("rodada", match.rodada as number)
    .limit(1)
  if (error) {
    return erroGenerico
  }
  if (posteriores && posteriores.length > 0) {
    return "A fase seguinte já foi gerada — as partidas das fases anteriores estão congeladas."
  }
  return null
}

/** Encerra uma partida em aberto (status → encerrada). Só o dono do torneio. */
export async function encerrarPartida(matchId: unknown): Promise<MatchLifecycleResult> {
  return mudarStatusComoDono(matchId, {
    podePartirDe: (status) => status !== "encerrada",
    erroTransicao: "Esta partida já está encerrada.",
    novoStatus: "encerrada",
    erroGenerico: "Não foi possível encerrar a partida agora. Tente novamente.",
  })
}

/**
 * Reabre uma partida encerrada (status → em_andamento) para correção de
 * placar. Só o dono do torneio.
 */
export async function reabrirPartida(matchId: unknown): Promise<MatchLifecycleResult> {
  return mudarStatusComoDono(matchId, {
    podePartirDe: (status) => status === "encerrada",
    erroTransicao: "Só é possível reabrir uma partida encerrada.",
    novoStatus: "em_andamento",
    erroGenerico: "Não foi possível reabrir a partida agora. Tente novamente.",
  })
}
