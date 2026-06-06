"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import {
  gerarTabelaLiga,
  LIGA_MAX_PARTICIPANTES,
} from "@/features/league/gerarTabelaLiga"
import { gerarCodigoConvite } from "@/lib/invite-code"
import { createClient } from "@/lib/supabase/server"
import { createTournamentSchema } from "@/schema/tournamentSchema"

export type TournamentFormState = {
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

/**
 * Cria um torneio com o usuário da sessão como dono. `created_by` é definido
 * no SERVIDOR (`user.id`) — o cliente não informa o dono, e a RLS
 * (`with check (created_by = auth.uid())`) é a segunda barreira. Defesa em
 * profundidade: sessão exigida aqui + políticas no banco.
 */
export async function createTournament(
  _prevState: TournamentFormState,
  formData: FormData
): Promise<TournamentFormState> {
  // Conversão EXPLÍCITA da string do form (sem z.coerce — mesma decisão do
  // placar): campo vazio/ausente vira undefined e o Zod aplica o default;
  // string não-vazia vira Number (NaN é rejeitado pelo Zod); qualquer outro
  // tipo (ex.: File) passa cru e cai na validação do Zod.
  const pontosOuDefault = (campo: string) => {
    const valor = formData.get(campo)
    if (valor === null || valor === "") return undefined
    return typeof valor === "string" ? Number(valor) : valor
  }

  const parsed = createTournamentSchema.safeParse({
    titulo: formData.get("titulo"),
    // Checkbox nativo: qualquer presença no FormData = marcado; ausente = false.
    isPublic: formData.get("isPublic") !== null,
    // Radio nativo: ausente vira undefined e o Zod aplica o default 'avulso'.
    formato: formData.get("formato") ?? undefined,
    idaEVolta: formData.get("idaEVolta") !== null,
    pontosVitoria: pontosOuDefault("pontosVitoria"),
    pontosEmpate: pontosOuDefault("pontosEmpate"),
    pontosDerrota: pontosOuDefault("pontosDerrota"),
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
    return { error: "Sessão expirada. Entre novamente para criar um torneio." }
  }

  // Liga nasce em RASCUNHO (período de adesão por convite; a tabela é gerada
  // pelo dono via iniciarTorneio). Avulso omite o status — fica com o default
  // 'ativo' do banco, preservando o comportamento original.
  const ehLiga = parsed.data.formato === "liga"

  let torneioId: string
  try {
    const { data: torneio, error } = await supabase
      .from("tournaments")
      .insert({
        titulo: parsed.data.titulo,
        is_public: parsed.data.isPublic,
        created_by: user.id,
        formato: parsed.data.formato,
        // ida_e_volta só significa algo em liga; no avulso vai false (default).
        ida_e_volta: ehLiga ? parsed.data.idaEVolta : false,
        ...(ehLiga ? { status: "rascunho" as const } : {}),
        // Sempre enviados (defaults do Zod): o default do DDL é só para
        // torneios legados/escritas administrativas.
        pontos_vitoria: parsed.data.pontosVitoria,
        pontos_empate: parsed.data.pontosEmpate,
        pontos_derrota: parsed.data.pontosDerrota,
      })
      .select("id")
      .single()
    if (error || !torneio) {
      console.error("createTournament falhou", error?.code ?? error?.message)
      return { error: "Não foi possível criar o torneio agora. Tente novamente." }
    }
    torneioId = torneio.id

    // Escritas complementares (sem transação via PostgREST): falha aqui NÃO
    // derruba o torneio já criado — os estados são recuperáveis na UI da
    // página do torneio ("Participar" / "Gerar link de convite").
    const { error: participanteError } = await supabase
      .from("participants")
      .insert({ tournament_id: torneio.id, user_id: user.id })
    if (participanteError) {
      console.error(
        "createTournament: dono não entrou como participante",
        participanteError.code ?? participanteError.message
      )
    }

    // Colisão do UNIQUE global do code (23505, ~impossível com 80 bits):
    // um retry com código novo; depois desiste (recuperável na UI).
    for (let i = 0; i < 2; i++) {
      const { error: inviteError } = await supabase
        .from("tournament_invites")
        .insert({ tournament_id: torneio.id, code: gerarCodigoConvite() })
      if (!inviteError) break
      console.error(
        "createTournament: convite não gerado",
        inviteError.code ?? inviteError.message
      )
      if (inviteError.code !== "23505") break
    }
  } catch {
    return { error: "Não foi possível criar o torneio agora. Tente novamente." }
  }

  // redirect() fora do try/catch (lança NEXT_REDIRECT). Destino: a página do
  // torneio — é onde estão o link de convite recém-gerado e, se alguma escrita
  // complementar falhou, os botões de recuperação (Participar / Gerar link).
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  redirect(`/dashboard/torneios/${torneioId}`)
}

export type IniciarTorneioResult = { ok: true } | { ok: false; error: string }

/**
 * Inicia uma LIGA em rascunho: gera a tabela round-robin completa (motor puro
 * `gerarTabelaLiga`) e promove o torneio a 'ativo'.
 *
 * Segurança em profundidade: sessão + propriedade/estado por FILTRO no
 * servidor (dono + formato liga + rascunho → resposta única, sem oráculo) +
 * RLS (`matches_insert_tournament_owner` exige dono e, em liga, rodada
 * preenchida; `tournaments_update_owner` cobre a promoção).
 *
 * Sem transação via PostgREST — DUAS escritas na ordem falha-segura:
 *   1. INSERT em lote das partidas (um request = um statement = atômico).
 *   2. UPDATE do status para 'ativo'.
 * Se (2) falhar, o retry detecta partidas com rodada já geradas e NÃO insere
 * de novo — só promove o status (recuperação idempotente). A ordem inversa
 * criaria liga ativa sem partidas, sem caminho de retry.
 */
export async function iniciarTorneio(
  tournamentId: unknown
): Promise<IniciarTorneioResult> {
  const parsed = z.uuid().safeParse(tournamentId)
  if (!parsed.success) {
    return { ok: false, error: "Torneio inválido." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const erroGenerico = "Não foi possível iniciar o torneio agora. Tente novamente."
  // Resposta única para inexistente/alheio/avulso/já iniciado: sem oráculo.
  const erroPropriedade =
    "Torneio não encontrado, já iniciado ou você não é o dono dele."

  // Propriedade + formato + estado por FILTRO (padrão das actions).
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, ida_e_volta")
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .eq("formato", "liga")
    .eq("status", "rascunho")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: erroGenerico }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }

  // Recuperação idempotente: tabela já gerada (retry após falha na promoção,
  // ou corrida entre duas abas) → não insere de novo, só promove o status.
  const { data: jaGeradas, error: geradasError } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", parsed.data)
    .not("rodada", "is", null)
    .limit(1)
  if (geradasError) {
    return { ok: false, error: erroGenerico }
  }

  if (!jaGeradas || jaGeradas.length === 0) {
    const { data: confirmados, error: participantesError } = await supabase
      .from("participants")
      .select("user_id")
      .eq("tournament_id", parsed.data)
    if (participantesError) {
      return { ok: false, error: erroGenerico }
    }

    const participantes = (confirmados ?? []).map((p) => p.user_id)
    if (participantes.length < 2) {
      return {
        ok: false,
        error:
          "A liga precisa de pelo menos 2 participantes confirmados. Compartilhe o link de convite.",
      }
    }
    if (participantes.length > LIGA_MAX_PARTICIPANTES) {
      return {
        ok: false,
        error: `A liga aceita no máximo ${LIGA_MAX_PARTICIPANTES} participantes.`,
      }
    }

    // Ordenação por code-point ANTES do motor: determinismo cross-locale
    // (mesma decisão do computeStandings). O motor não embaralha.
    participantes.sort()

    let rodadas
    try {
      rodadas = gerarTabelaLiga(participantes, torneio.ida_e_volta)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : erroGenerico }
    }

    // Um único INSERT em lote: atômico no banco (tabela inteira ou nada).
    const partidas = rodadas.flatMap((r) =>
      r.confrontos.map(([p1, p2]) => ({
        tournament_id: parsed.data,
        participante_1: p1,
        participante_2: p2,
        rodada: r.rodada,
      }))
    )
    const { error: insertError } = await supabase.from("matches").insert(partidas)
    if (insertError) {
      console.error("iniciarTorneio: geração falhou", insertError.code ?? insertError.message)
      // 23505 = perdedor da corrida de dupla geração (índice matches_liga_par_unico):
      // a OUTRA chamada já gerou a tabela — recarregar mostra o torneio ativo.
      if (insertError.code === "23505") {
        return {
          ok: false,
          error: "A tabela já foi gerada (talvez em outra aba). Recarregue a página.",
        }
      }
      return { ok: false, error: erroGenerico }
    }
  }

  // Promoção. `.select()` confirma a escrita (RLS/corrida → 0 linhas).
  const { data: promovido, error: updateError } = await supabase
    .from("tournaments")
    .update({ status: "ativo" })
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .eq("status", "rascunho")
    .select("id")
  if (updateError) {
    return { ok: false, error: erroGenerico }
  }
  if (!promovido || promovido.length === 0) {
    return {
      ok: false,
      error: "O torneio pode ter sido alterado. Recarregue e tente novamente.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsed.data}`)
  return { ok: true }
}
