"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import {
  gerarTabelaLiga,
  LIGA_MAX_PARTICIPANTES,
} from "@/features/league/gerarTabelaLiga"
import {
  gerarFaseInicial,
  gerarProximaFase,
  MATA_MATA_MAX_PARTICIPANTES,
  montarConfrontosManual,
  montarConfrontosPotes,
  montarConfrontosSorteio,
  type ConfrontoChave,
  type PartidaChave,
} from "@/features/knockout/gerarChaveMataMata"
import { gerarCodigoConvite } from "@/lib/invite-code"
import { randIntCrypto } from "@/lib/rand"
import { createClient } from "@/lib/supabase/server"
import {
  createTournamentSchema,
  iniciarMataMataSchema,
} from "@/schema/tournamentSchema"

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
    terceiroLugar: formData.get("terceiroLugar") !== null,
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

  // Formato GERADO (liga, mata-mata) nasce em RASCUNHO (período de adesão por
  // convite; tabela/chave geradas pelo dono ao iniciar). Avulso omite o status
  // — fica com o default 'ativo' do banco, preservando o comportamento original.
  const ehGerado = parsed.data.formato !== "avulso"

  let torneioId: string
  try {
    const { data: torneio, error } = await supabase
      .from("tournaments")
      .insert({
        titulo: parsed.data.titulo,
        is_public: parsed.data.isPublic,
        created_by: user.id,
        formato: parsed.data.formato,
        // Opções normalizadas no SERVIDOR: ida_e_volta vale em liga e
        // mata-mata; terceiro_lugar só em mata-mata — fora do formato, false
        // (não confia no form para coerência de opções).
        ida_e_volta: ehGerado ? parsed.data.idaEVolta : false,
        terceiro_lugar:
          parsed.data.formato === "mata_mata" ? parsed.data.terceiroLugar : false,
        ...(ehGerado ? { status: "rascunho" as const } : {}),
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

export type TournamentLifecycleResult = { ok: true } | { ok: false; error: string }

/**
 * Encerra um torneio (status → 'encerrado'). Só o dono; QUALQUER status
 * não-encerrado é encerrável (encerrar um rascunho = cancelar um torneio que
 * não começou). Partidas em aberto ficam congeladas pelo lifecycle existente
 * e fora da classificação — decisão de produto; a UI avisa antes.
 *
 * UPDATE direto por FILTRO (sem fetch prévio — o filtro JÁ valida dono e
 * transição): 0 linhas cobre inexistente/alheio/já encerrado/corrida com a
 * MESMA resposta, sem oráculo. RLS `tournaments_update_owner` é a segunda
 * barreira.
 */
export async function encerrarTorneio(
  tournamentId: unknown
): Promise<TournamentLifecycleResult> {
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

  const { data: atualizados, error: updateError } = await supabase
    .from("tournaments")
    .update({ status: "encerrado" })
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .neq("status", "encerrado")
    .select("id")
  if (updateError) {
    return {
      ok: false,
      error: "Não foi possível encerrar o torneio agora. Tente novamente.",
    }
  }
  if (!atualizados || atualizados.length === 0) {
    return {
      ok: false,
      error: "Torneio não encontrado, já encerrado ou você não é o dono dele.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsed.data}`)
  return { ok: true }
}

/**
 * Reabre um torneio encerrado. O status de retorno é DERIVADO do estado (não
 * há histórico): formato gerado (liga/mata-mata) sem NENHUMA partida gerada
 * (nenhuma com `rodada`) volta a 'rascunho' — reabrir como ativo criaria
 * liga/chave "ativa" sem partidas e sem painel de Iniciar (beco); nos demais
 * casos volta a 'ativo'.
 */
export async function reabrirTorneio(
  tournamentId: unknown
): Promise<TournamentLifecycleResult> {
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

  const erroGenerico = "Não foi possível reabrir o torneio agora. Tente novamente."
  const erroPropriedade =
    "Torneio não encontrado, não encerrado ou você não é o dono dele."

  // Propriedade + estado por FILTRO; `formato` alimenta a derivação abaixo.
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, formato")
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .eq("status", "encerrado")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: erroGenerico }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }

  let novoStatus: "ativo" | "rascunho" = "ativo"
  if (torneio.formato !== "avulso") {
    const { data: geradas, error: geradasError } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", parsed.data)
      .not("rodada", "is", null)
      .limit(1)
    if (geradasError) {
      return { ok: false, error: erroGenerico }
    }
    if (!geradas || geradas.length === 0) {
      novoStatus = "rascunho"
    }
  }

  const { data: atualizados, error: updateError } = await supabase
    .from("tournaments")
    .update({ status: novoStatus })
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .eq("status", "encerrado")
    .select("id")
  if (updateError) {
    return { ok: false, error: erroGenerico }
  }
  if (!atualizados || atualizados.length === 0) {
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

/**
 * Inicia um MATA-MATA em rascunho: monta a chave conforme o modo escolhido
 * (sorteio | potes | manual — o modo NÃO persiste, é parâmetro do form do
 * painel), insere a 1ª fase em lote (byes já encerrados — memória durável do
 * slot) e promove o torneio a 'ativo'.
 *
 * Mesma arquitetura falha-segura da liga (iniciarTorneio): propriedade/
 * formato/estado por FILTRO; INSERT em lote único ANTES do UPDATE de status;
 * retry idempotente detecta a chave já gerada e só promove; 23505 do índice
 * matches_mata_mata_slot_unico = perdedor da corrida de dupla geração.
 */
export async function iniciarMataMata(
  _prevState: TournamentFormState,
  formData: FormData
): Promise<TournamentFormState> {
  // Selects do modo manual: "" = lado vazio (bye) → null.
  const lerLado = (campo: string): string | null => {
    const valor = formData.get(campo)
    return typeof valor === "string" && valor !== "" ? valor : null
  }
  // Slots presentes no form (a página renderiza metade da chave do N atual).
  const confrontosForm: [string | null, string | null][] = []
  for (let i = 1; i <= MATA_MATA_MAX_PARTICIPANTES / 2; i++) {
    if (formData.has(`slot_${i}_1`) || formData.has(`slot_${i}_2`)) {
      confrontosForm.push([lerLado(`slot_${i}_1`), lerLado(`slot_${i}_2`)])
    }
  }

  const parsed = iniciarMataMataSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    modo: formData.get("modo"),
    // Checkboxes "cabeça de chave" compartilham o name (modo potes).
    cabecas: formData.getAll("cabecas"),
    confrontos: confrontosForm,
  })
  if (!parsed.success) {
    return { error: "Dados do chaveamento inválidos. Recarregue e tente novamente." }
  }
  const { tournamentId, modo } = parsed.data

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: "Você precisa estar autenticado." }
  }

  const erroGenerico = "Não foi possível iniciar o torneio agora. Tente novamente."
  const erroPropriedade =
    "Torneio não encontrado, já iniciado ou você não é o dono dele."

  // Propriedade + formato + estado por FILTRO (padrão das actions).
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, ida_e_volta, terceiro_lugar")
    .eq("id", tournamentId)
    .eq("created_by", user.id)
    .eq("formato", "mata_mata")
    .eq("status", "rascunho")
    .maybeSingle()
  if (torneioError) {
    return { error: erroGenerico }
  }
  if (!torneio) {
    return { error: erroPropriedade }
  }

  // Recuperação idempotente: chave já gerada (retry após falha na promoção,
  // ou corrida entre duas abas) → não insere de novo, só promove o status.
  const { data: jaGeradas, error: geradasError } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .not("rodada", "is", null)
    .limit(1)
  if (geradasError) {
    return { error: erroGenerico }
  }

  if (!jaGeradas || jaGeradas.length === 0) {
    const { data: confirmados, error: participantesError } = await supabase
      .from("participants")
      .select("user_id")
      .eq("tournament_id", tournamentId)
    if (participantesError) {
      return { error: erroGenerico }
    }

    const participantes = (confirmados ?? []).map((p) => p.user_id)
    if (participantes.length < 2) {
      return {
        error:
          "O mata-mata precisa de pelo menos 2 participantes confirmados. Compartilhe o link de convite.",
      }
    }
    if (participantes.length > MATA_MATA_MAX_PARTICIPANTES) {
      return {
        error: `O mata-mata aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} participantes.`,
      }
    }

    // Ordenação por code-point ANTES do motor: base canônica determinística
    // (a aleatoriedade entra SÓ pelo randInt injetado — auditável em teste).
    participantes.sort()

    let confrontos: ConfrontoChave[]
    try {
      if (modo === "sorteio") {
        confrontos = montarConfrontosSorteio(participantes, randIntCrypto)
      } else if (modo === "potes") {
        const confirmadosSet = new Set(participantes)
        const cabecas = [...parsed.data.cabecas].sort()
        if (!cabecas.every((c) => confirmadosSet.has(c))) {
          return { error: "Cabeça de chave fora da lista de participantes." }
        }
        const cabecasSet = new Set(cabecas)
        if (cabecasSet.size !== cabecas.length) {
          return { error: "Cabeça de chave repetida." }
        }
        const demais = participantes.filter((p) => !cabecasSet.has(p))
        confrontos = montarConfrontosPotes(cabecas, demais, randIntCrypto)
      } else {
        confrontos = montarConfrontosManual(parsed.data.confrontos, participantes)
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : erroGenerico }
    }

    // Um único INSERT em lote: atômico no banco (chave inteira ou nada).
    // Bye nasce 'encerrada' 0x0: o slot persiste e o lado 1 avança no
    // avancarFase; o motor de classificação ignora (exige os dois lados).
    const partidas = gerarFaseInicial(confrontos, torneio.ida_e_volta).map(
      (p: PartidaChave) => ({
        tournament_id: tournamentId,
        participante_1: p.participante_1,
        participante_2: p.participante_2,
        rodada: p.rodada,
        posicao: p.posicao,
        perna: p.perna,
        ...(p.bye ? { status: "encerrada" as const } : {}),
      })
    )
    const { error: insertError } = await supabase.from("matches").insert(partidas)
    if (insertError) {
      console.error(
        "iniciarMataMata: geração falhou",
        insertError.code ?? insertError.message
      )
      // 23505 = perdedor da corrida (índice matches_mata_mata_slot_unico).
      if (insertError.code === "23505") {
        return {
          error: "A chave já foi gerada (talvez em outra aba). Recarregue a página.",
        }
      }
      return { error: erroGenerico }
    }
  }

  // Promoção. `.select()` confirma a escrita (RLS/corrida → 0 linhas).
  const { data: promovido, error: updateError } = await supabase
    .from("tournaments")
    .update({ status: "ativo" })
    .eq("id", tournamentId)
    .eq("created_by", user.id)
    .eq("status", "rascunho")
    .select("id")
  if (updateError) {
    return { error: erroGenerico }
  }
  if (!promovido || promovido.length === 0) {
    return {
      error: "O torneio pode ter sido alterado. Recarregue e tente novamente.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${tournamentId}`)
  return {}
}

/**
 * Avança o mata-mata para a fase seguinte: exige TODOS os confrontos da fase
 * atual decididos (motor puro `gerarProximaFase` valida e pareia vencedores
 * por slot), insere a nova fase em lote único. Semifinais → final e, se o
 * torneio tem 3º lugar e há dois perdedores reais, a disputa de 3º.
 *
 * Corrida/duplo clique: o índice matches_mata_mata_slot_unico derruba o
 * segundo lote inteiro (23505) — sem estado parcial.
 */
export async function avancarFase(
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

  const erroGenerico = "Não foi possível avançar a fase agora. Tente novamente."
  const erroPropriedade =
    "Torneio não encontrado, não iniciado ou você não é o dono dele."

  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, ida_e_volta, terceiro_lugar")
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .eq("formato", "mata_mata")
    .eq("status", "ativo")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: erroGenerico }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }

  const { data: partidas, error: partidasError } = await supabase
    .from("matches")
    .select(
      "rodada, posicao, perna, participante_1, participante_2, placar_1, placar_2, status"
    )
    .eq("tournament_id", parsed.data)
    .not("rodada", "is", null)
  if (partidasError) {
    return { ok: false, error: erroGenerico }
  }
  if (!partidas || partidas.length === 0) {
    return { ok: false, error: "A chave deste torneio ainda não foi gerada." }
  }

  let novas: PartidaChave[]
  try {
    novas = gerarProximaFase(partidas, {
      idaEVolta: torneio.ida_e_volta,
      terceiroLugar: torneio.terceiro_lugar,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : erroGenerico }
  }
  if (novas.length === 0) {
    return {
      ok: false,
      error: "O torneio já está decidido — a final foi disputada.",
    }
  }

  // Pré-checagem ACIONÁVEL: a RLS de INSERT exige cada semeado em
  // `participants`. Saída/remoção em mata-mata ativo é bloqueada (action +
  // policy), mas se uma linha sumiu por outro caminho (admin, corrida), o
  // INSERT falharia com erro de RLS e a mensagem genérica mascararia um
  // estado permanente — aqui o dono fica sabendo O QUE travou o avanço.
  const semeados = [
    ...new Set(
      novas.flatMap((p) =>
        [p.participante_1, p.participante_2].filter(
          (id): id is string => id !== null
        )
      )
    ),
  ]
  const { data: confirmados, error: confirmadosError } = await supabase
    .from("participants")
    .select("user_id")
    .eq("tournament_id", parsed.data)
    .in("user_id", semeados)
  if (confirmadosError) {
    return { ok: false, error: erroGenerico }
  }
  const confirmadosSet = new Set((confirmados ?? []).map((p) => p.user_id))
  if (!semeados.every((id) => confirmadosSet.has(id))) {
    return {
      ok: false,
      error:
        "Um participante classificado não está mais no torneio — a fase seguinte não pode ser gerada.",
    }
  }

  const { error: insertError } = await supabase.from("matches").insert(
    novas.map((p) => ({
      tournament_id: parsed.data,
      participante_1: p.participante_1,
      participante_2: p.participante_2,
      rodada: p.rodada,
      posicao: p.posicao,
      perna: p.perna,
    }))
  )
  if (insertError) {
    console.error(
      "avancarFase: geração falhou",
      insertError.code ?? insertError.message
    )
    if (insertError.code === "23505") {
      return {
        ok: false,
        error: "A fase já foi avançada (talvez em outra aba). Recarregue a página.",
      }
    }
    return { ok: false, error: erroGenerico }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsed.data}`)
  return { ok: true }
}
