"use server"

import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { FORMATOS_COM_CHAVE } from "@/features/knockout/gerarChaveMataMata"
import { varrerOrfaosDaRodada } from "@/features/match/closeRound"
import { enviarNotificacoes } from "@/features/notifications/enviar"
import { podeArbitrar, podeGerir } from "@/lib/autorizacao"
import { createClient } from "@/lib/supabase/server"
import {
  agregarAutores,
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

/** Embed to-one da vaga (técnico atual) como o PostgREST devolve: objeto ou null. */
type VagaTecnico = { user_id: string | null } | null

/** Forma mínima da partida para a checagem de propriedade (avulso + vagas). */
type MatchProprietario = {
  participante_1: string | null
  participante_2: string | null
  vaga_1?: VagaTecnico
  vaga_2?: VagaTecnico
}

/**
 * Confere se `userId` JOGA a partida: lado avulso (participante_1/2) OU técnico
 * de uma das vagas competitivas (slot.user_id). Vaga órfã (user_id null) não
 * concede acesso — o dono age pelo caminho de dono. Os dois modelos são
 * mutuamente exclusivos no banco (CHECK), então testar ambos é seguro.
 */
function ehJogadorDaPartida(
  match: MatchProprietario,
  userId: string
): boolean {
  return (
    match.participante_1 === userId ||
    match.participante_2 === userId ||
    match.vaga_1?.user_id === userId ||
    match.vaga_2?.user_id === userId
  )
}

/**
 * Atualiza o placar de uma partida.
 *
 * Segurança em profundidade (a Server Action é alcançável por POST direto,
 * não só pela UI — ver docs do Next 16):
 *   1. Valida a entrada com Zod.
 *   2. Confere a identidade via `auth.getUser()` (valida o JWT no servidor de
 *      auth; não confia apenas no cookie como `getSession`).
 *   3. Verifica a PROPRIEDADE: avulso → participante_1/2; competitivo →
 *      técnico de uma das vagas (slot.user_id === user.id). Vaga órfã (sem
 *      técnico) não dá acesso por aqui — o dono encerra/reabre pelo caminho
 *      de dono.
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
  const { matchId, placar_1, placar_2, autores } = parsed.data

  const supabase = await createClient()

  // 1) Identidade — valida a sessão no servidor de auth.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // 2) Propriedade — carrega a partida (lados avulso + lados por vaga, com o
  //    técnico atual de cada vaga) e confere se o usuário joga dela.
  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select(
      `id, participante_1, participante_2, status, tournament_id,
       vaga_1:tournament_slots!matches_vaga_1_fkey ( user_id ),
       vaga_2:tournament_slots!matches_vaga_2_fkey ( user_id ),
       tournaments ( titulo )`
    )
    .eq("id", matchId)
    .maybeSingle()

  if (fetchError) {
    return { ok: false, error: "Não foi possível carregar a partida." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }

  // Cast da fronteira: os FK-hints de vaga ainda não constam nos Relationships
  // de database.types (a fundação os adiciona), então o PostgREST não infere o
  // embed. O tipo explícito é a fonte de verdade aqui.
  // Quem grava o placar DIRETO: o participante do avulso OU quem ARBITRA o
  // torneio (admin/árbitro/dono). O técnico de vaga competitiva NÃO escreve mais
  // direto (change add-proposta-resultado-foto) — propõe com foto p/ aprovação.
  const dadosProp = match as unknown as MatchProprietario
  const ehAvulso = dadosProp.participante_1 === user.id || dadosProp.participante_2 === user.id
  if (!ehAvulso) {
    // Avulso grava direto (já liberado acima); fora dele, só quem ARBITRA o
    // torneio (admin/árbitro/dono). LAZY de propósito: a RPC pode_arbitrar só
    // dispara quando NÃO é avulso (evita viagem ao banco no caminho comum).
    const arbitra = await podeArbitrar(supabase, { tournamentId: match.tournament_id })
    if (!arbitra) {
      if (ehJogadorDaPartida(dadosProp, user.id)) {
        return { ok: false, error: "Envie o placar para aprovação com a foto de evidência." }
      }
      return { ok: false, error: "Você não participa desta partida." }
    }
  }

  // Encerrada é imutável (mensagem precisa; o trigger lock_match_lifecycle é
  // a barreira final contra POST direto). Correção: dono reabre antes.
  if (match.status === "encerrada") {
    return {
      ok: false,
      error: "Partida encerrada não aceita placar. Peça ao dono do torneio para reabri-la.",
    }
  }

  // Proposta de placar pendente: bloqueia a edição DIRETA enquanto houver uma
  // proposta aguardando aprovação (change fix-editar-placar-com-proposta-pendente).
  // A UI (OpenMatchesList) já esconde o botão, mas a action é alcançável por POST
  // direto / aba velha — esta guarda fecha a corrida e dá mensagem limpa (não o
  // "unexpected response"): o caminho é aprovar/rejeitar. Só faz sentido no
  // COMPETITIVO (avulso não tem propostas) — escopada por `!ehAvulso` para não
  // custar uma viagem ao banco no caminho avulso comum.
  if (!ehAvulso) {
    const { data: pendente } = await supabase
      .from("match_score_proposals")
      .select("id")
      .eq("match_id", matchId)
      .eq("status", "pendente")
      .limit(1)
      .maybeSingle()
    if (pendente) {
      return {
        ok: false,
        error:
          "Há uma proposta de placar aguardando aprovação. Aprove ou rejeite antes de editar o placar direto.",
      }
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

  // Autores dos gols (artilharia): quando o campo é informado, SUBSTITUI os gols
  // desta partida (delete-then-insert por match_id) — a mesma autorização do
  // placar já passou acima e a RLS de match_goals espelha essa autorização. O
  // campo AUSENTE não toca os gols (retrocompat); `[]` limpa. O Zod já garantiu
  // soma por lado ≤ placar e sem duplicata. Não-transacional entre chamadas
  // (aceitável no MVP): o placar já foi salvo; falha aqui retorna erro claro para
  // não deixar placar e gols em estados divergentes silenciosamente. Agregamos por
  // (lado, nome normalizado) antes do INSERT para casar com o índice único do banco
  // — nomes que só diferem em caixa/espaço somam numa linha só, sem violar o unique.
  if (autores !== undefined) {
    const { error: delError } = await supabase
      .from("match_goals")
      .delete()
      .eq("match_id", matchId)
    if (delError) {
      return { ok: false, error: "Placar salvo, mas não foi possível registrar os autores dos gols." }
    }
    const autoresAgg = agregarAutores(autores)
    if (autoresAgg.length > 0) {
      const { error: insError } = await supabase.from("match_goals").insert(
        autoresAgg.map((a) => ({
          match_id: matchId,
          lado: a.lado,
          jogador: a.jogador,
          gols: a.gols,
        }))
      )
      if (insError) {
        return { ok: false, error: "Placar salvo, mas não foi possível registrar os autores dos gols." }
      }
    }
  }

  // A página do torneio também exibe placar ao vivo (partidas em aberto,
  // classificação) — revalidar as DUAS rotas.
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)

  // Notifica os demais jogadores da partida (o helper remove o caller → sobra o
  // adversário). Corpo genérico de propósito: sem nomes/placar (evita PII e
  // query extra). O embed to-one da vaga e de tournaments volta como objeto
  // único — cast de fronteira (FK-hints de vaga ainda fora de database.types).
  const dados = match as unknown as {
    participante_1: string | null
    participante_2: string | null
    vaga_1: { user_id: string | null } | null
    vaga_2: { user_id: string | null } | null
    tournaments: { titulo: string } | null
  }
  await enviarNotificacoes(
    supabase,
    [
      dados.participante_1,
      dados.participante_2,
      dados.vaga_1?.user_id,
      dados.vaga_2?.user_id,
    ],
    {
      title: "Placar atualizado",
      body: `Há um novo placar em ${dados.tournaments?.titulo ?? "um torneio"}.`,
      url: `/dashboard/torneios/${match.tournament_id}`,
      tag: `torneio-${match.tournament_id}-placar`,
    },
    user.id
  )

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
    // Capacidade GERIR (dono ou admin) por PRÉ-CHECK; a RLS é o backstop.
    if (!(await podeGerir(supabase, { tournamentId: parsed.data.tournamentId }))) {
      return {
        error: "Torneio não encontrado, encerrado ou você não é o dono dele.",
      }
    }

    // Lifecycle + formato por FILTRO (a autorização já passou pelo pré-check).
    // `.neq` falha-segura (rascunho aceita partidas; status futuro não bloqueia
    // silenciosamente) — espelha a policy de INSERT.
    const { data: torneio, error: fetchError } = await supabase
      .from("tournaments")
      .select("id, formato")
      .eq("id", parsed.data.tournamentId)
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
  } catch (error) {
    // Falha INESPERADA do INSERT (o erro esperado já virou console.error +
    // mensagem acima). Reporta ao Sentry — o redirect está fora do try.
    Sentry.captureException(error, { tags: { action: "createMatch" } })
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
    .select(
      `id, participante_1, participante_2, time_1, time_2, status, tournament_id,
       vaga_1:tournament_slots!matches_vaga_1_fkey ( user_id ),
       vaga_2:tournament_slots!matches_vaga_2_fkey ( user_id )`
    )
    .eq("id", matchId)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: "Não foi possível carregar a partida." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }

  // Cast da fronteira: os FK-hints de vaga ainda não constam nos Relationships
  // de database.types (a fundação os adiciona), então o PostgREST não infere o
  // embed. O tipo explícito é a fonte de verdade aqui.
  // Trocar clube só faz sentido no AVULSO (clube cosmético por partida). No
  // competitivo o clube vem da vaga (torneio) — change add-proposta-resultado-foto
  // / fix-menu-partida-clube-do-torneio. Por isso só o participante do avulso edita.
  const dadosClube = match as unknown as MatchProprietario
  if (dadosClube.participante_1 !== user.id && dadosClube.participante_2 !== user.id) {
    return { ok: false, error: "O clube desta partida vem do torneio." }
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
      "id, status, tournament_id, rodada, posicao, perna, participante_1, participante_2, vaga_1, vaga_2, placar_1, placar_2"
    )
    .eq("id", parsed.data)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: opts.erroGenerico }
  }

  // Propriedade do TORNEIO — partida inexistente, invisível, de torneio alheio
  // OU de torneio encerrado recebem a MESMA resposta (sem oráculo). Torneio
  // encerrado congela o lifecycle das partidas: reabrir ali seria beco sem saída
  // (a partida some do dashboard e de toda edição).
  const erroPropriedade =
    "Partida não encontrada, torneio encerrado ou você não é o dono dele."
  if (!match) {
    return { ok: false, error: erroPropriedade }
  }
  // Capacidade ARBITRAR (dono, admin ou árbitro) por PRÉ-CHECK, TRANSITIVA pelo
  // torneio da partida; a RLS é o backstop.
  if (!(await podeArbitrar(supabase, { tournamentId: match.tournament_id }))) {
    return { ok: false, error: erroPropriedade }
  }
  // Lifecycle + formato por FILTRO (a autorização já passou pelo pré-check).
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, formato")
    .eq("id", match.tournament_id)
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

  // Regras de eliminatória nos formatos COM CHAVE (mensagem precisa; o
  // trigger valida_resultado_mata_mata é a barreira final contra POST direto).
  if (
    (FORMATOS_COM_CHAVE as readonly string[]).includes(torneio.formato) &&
    match.rodada !== null
  ) {
    const erro = await validarLifecycleMataMata(supabase, match, opts.novoStatus)
    if (erro) {
      return { ok: false, error: erro }
    }
  }

  // Reabrir LIMPA o W.O. (a partida volta a aberta sem marca; o placar 0x0 é
  // descartável). Idempotente para partidas normais. O lock_match_lifecycle
  // permite a mudança de wo aqui porque o status SAI de encerrada.
  const patch: {
    status: "encerrada" | "em_andamento"
    wo?: boolean
    wo_vencedor?: null
    wo_duplo?: boolean
  } = { status: opts.novoStatus }
  if (opts.novoStatus === "em_andamento") {
    patch.wo = false
    patch.wo_vencedor = null
    // Duplo W.O. também é limpo — senão a CHECK (ramo fora de W.O., wo_duplo
    // falso) barraria a reabertura de uma partida que era duplo.
    patch.wo_duplo = false
  }

  // `.select()` confirma a escrita E uma GUARDA OTIMISTA de status no WHERE
  // fecha a corrida (check-then-act): encerrar exige partida AINDA não
  // encerrada; reabrir exige AINDA encerrada. Sem isso, dois donos (2 abas)
  // poderiam reabrir+marcar W.O. na mesma partida em interleaving — agora o
  // perdedor casa 0 linhas. Espelha o `.neq`/`.eq` de marcarWoInterno/varredura.
  const baseUpdate = supabase.from("matches").update(patch).eq("id", parsed.data)
  const comGuarda =
    opts.novoStatus === "encerrada"
      ? baseUpdate.neq("status", "encerrada")
      : baseUpdate.eq("status", "encerrada")
  const { data: atualizada, error: updateError } = await comGuarda.select("id")
  if (updateError) {
    return { ok: false, error: opts.erroGenerico }
  }
  if (!atualizada || atualizada.length === 0) {
    return {
      ok: false,
      error: "A partida pode ter sido alterada. Recarregue e tente novamente.",
    }
  }

  // Fechamento AUTOMÁTICO da rodada (decisão 6): ao encerrar uma partida
  // competitiva, se NÃO resta jogo jogável aberto na rodada, as partidas contra
  // clubes órfãos viram W.O. automaticamente. Roda como o dono (encerrarPartida
  // é dono-only). Best-effort: a varredura não derruba o encerramento.
  if (opts.novoStatus === "encerrada" && match.rodada !== null) {
    try {
      await varrerOrfaosDaRodada(supabase, match.tournament_id, match.rodada, {
        somenteSeRodadaCompleta: true,
      })
    } catch (e) {
      // Secundário ao encerramento (que já teve sucesso): nunca derruba. Mas é
      // ESCRITA inesperada engolida (auto-W.O. via UPDATE em matches) — reporta
      // ao Sentry, senão uma falha silenciosa deixa partidas órfãs sem o W.O. e
      // some do painel. Paridade com os demais catches de escrita das actions.
      Sentry.captureException(e, {
        tags: { action: "encerrarPartida.varrerOrfaos" },
      })
      console.error("fechamento automático da rodada falhou", e)
    }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  return { ok: true }
}

/**
 * Regras de lifecycle dos formatos COM CHAVE (partida com rodada em torneio
 * mata_mata/grupos_mata_mata/fase_liga). Devolve a mensagem de erro ou null
 * quando a transição é válida. Espelha o trigger `valida_resultado_mata_mata`
 * (banco = backstop):
 *   - partida de CHAVE (posicao não nula): encerrar jogo único exige vencedor;
 *     encerrar a volta exige ida encerrada e agregado desempatado (a volta tem
 *     lados invertidos: agregado A = ida.placar_1 + volta.placar_2); bye nunca
 *     reabre; fase de chave posterior congela as anteriores;
 *   - partida de GRUPO (posicao nula): empata e reabre livre ATÉ o mata-mata
 *     ser gerado — depois disso a classificação foi CONSUMIDA pelo cruzamento
 *     e reabrir tornaria a chave incoerente.
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
    vaga_1: string | null
    vaga_2: string | null
    placar_1: number
    placar_2: number
  },
  novoStatus: "encerrada" | "em_andamento"
): Promise<string | null> {
  const erroGenerico = "Não foi possível validar o confronto. Tente novamente."
  // Lado de CADA modelo: participante no avulso/legado, VAGA no competitivo
  // clube-cêntrico. Sem o coalesce, a chave de clubes (participante_* sempre
  // null) seria tratada como bye — encerrar pularia a validação de empate e
  // reabrir falharia sempre com "bye não reabre" (espelha a correção do
  // trigger valida_resultado_mata_mata).
  const lado1 = match.participante_1 ?? match.vaga_1 ?? null
  const lado2 = match.participante_2 ?? match.vaga_2 ?? null

  // Partida de GRUPO: resultado livre (empate pontua); só a REABERTURA é
  // condicionada — bloqueada quando o mata-mata já foi gerado.
  if (match.posicao === null) {
    if (novoStatus === "encerrada") {
      return null
    }
    const { data: daChave, error } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", match.tournament_id)
      .not("posicao", "is", null)
      .limit(1)
    if (error) {
      return erroGenerico
    }
    if (daChave && daChave.length > 0) {
      return "O mata-mata já foi gerado — a classificação dos grupos está congelada."
    }
    return null
  }

  if (novoStatus === "encerrada") {
    // Bye (lado nulo) nasce encerrado — não há placar a validar.
    if (lado1 === null || lado2 === null) {
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

  // Reabertura de partida de CHAVE.
  if (lado1 === null || lado2 === null) {
    return "Partida de avanço direto (bye) não pode ser reaberta."
  }
  // Só fases de CHAVE posteriores congelam (espelha o trigger) — nos formatos
  // de grupos as rodadas de grupo vêm antes e não contam aqui.
  const { data: posteriores, error } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", match.tournament_id)
    .not("posicao", "is", null)
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
