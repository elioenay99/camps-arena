"use server"

import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import {
  gerarTabelaLiga,
  LIGA_MAX_PARTICIPANTES,
} from "@/features/league/gerarTabelaLiga"
import {
  FORMATOS_COM_CHAVE,
  gerarFaseInicial,
  gerarProximaFase,
  MATA_MATA_MAX_PARTICIPANTES,
  montarConfrontosManual,
  montarConfrontosPotes,
  montarConfrontosSorteio,
  type ConfrontoChave,
  type PartidaChave,
} from "@/features/knockout/gerarChaveMataMata"
import {
  classificarGrupos,
  cruzarClassificados,
  gerarPartidasGrupos,
  montarGruposManual,
  montarGruposPotes,
  montarGruposSorteio,
  validarGeometria,
  type PartidaGrupoJogada,
} from "@/features/groups/gerarFaseDeGrupos"
import { gerarCodigoConvite } from "@/lib/invite-code"
import { randIntCrypto } from "@/lib/rand"
import { createClient } from "@/lib/supabase/server"
import { coresOpcionais, type CoresInput } from "@/schema/corSchema"
import { alvoLiberacaoSchema, type AlvoLiberacao } from "@/schema/liberacaoSchema"
import {
  createTournamentSchema,
  iniciarGruposSchema,
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
    // Clubes (formatos competitivos): inputs hidden name="clubes"; só strings
    // entram (File etc. caem na validação do Zod como uuid inválido).
    clubes: formData.getAll("clubes").filter((c): c is string => typeof c === "string"),
    // Modo por-nome: checkbox + nomes livres (hidden name="nomes").
    porNome: formData.get("porNome") !== null,
    nomes: formData.getAll("nomes").filter((n): n is string => typeof n === "string"),
    corPrimaria: formData.get("corPrimaria") ?? undefined,
    corSecundaria: formData.get("corSecundaria") ?? undefined,
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
  // Modo "competidores por nome": só vale em formato gerado; o servidor decide
  // (não confia no toggle do form para avulso).
  const porNome = ehGerado && parsed.data.porNome

  let torneioId: string
  try {
    const { data: torneio, error } = await supabase
      .from("tournaments")
      .insert({
        titulo: parsed.data.titulo,
        is_public: parsed.data.isPublic,
        created_by: user.id,
        formato: parsed.data.formato,
        // Opções normalizadas no SERVIDOR: ida_e_volta vale nos formatos
        // gerados; terceiro_lugar só nos formatos COM CHAVE — fora do
        // formato, false (não confia no form para coerência de opções).
        ida_e_volta: ehGerado ? parsed.data.idaEVolta : false,
        terceiro_lugar: (FORMATOS_COM_CHAVE as readonly string[]).includes(
          parsed.data.formato
        )
          ? parsed.data.terceiroLugar
          : false,
        ...(ehGerado ? { status: "rascunho" as const } : {}),
        // Vagas por NOME (sem clube) — só em formato gerado.
        por_nome: porNome,
        // Sempre enviados (defaults do Zod): o default do DDL é só para
        // torneios legados/escritas administrativas.
        pontos_vitoria: parsed.data.pontosVitoria,
        pontos_empate: parsed.data.pontosEmpate,
        pontos_derrota: parsed.data.pontosDerrota,
        // Cores do campeonato (change add-cores-campeonato): `undefined` (campo
        // vazio) ⇒ null = tema base do app. Já normalizadas (minúsculo) pelo Zod.
        cor_primaria: parsed.data.corPrimaria ?? null,
        cor_secundaria: parsed.data.corSecundaria ?? null,
      })
      .select("id")
      .single()
    if (error || !torneio) {
      console.error("createTournament falhou", error?.code ?? error?.message)
      return { error: "Não foi possível criar o torneio agora. Tente novamente." }
    }
    torneioId = torneio.id

    if (ehGerado) {
      // Modelo clube-cêntrico: o torneio competitivo nasce com as VAGAS (uma
      // por clube, técnico vazio) e um convite por vaga. O dono NÃO entra como
      // participante (participants é exclusivo do avulso) e não há convite
      // genérico (o link é por clube). Ordem falha-segura: tournament → slots →
      // invites. Falha nas VAGAS é FATAL: um competitivo sem geometria é beco
      // sem saída (não há UI para repor clubes pós-criação) — compensação por
      // DELETE do torneio recém-criado + erro no form (o useActionState
      // preserva título/clubes; re-submeter recria tudo). Convite faltando é
      // diferente: regenerável por vaga na página do torneio (não-fatal).
      // Shape unificado (team_id OU rotulo; o outro fica undefined → a CHECK XOR
      // do banco garante a coerência). Tipado p/ não inferir union de arrays.
      const linhasVagas: {
        tournament_id: string
        team_id?: string
        rotulo?: string
      }[] = porNome
        ? parsed.data.nomes.map((nome) => ({ tournament_id: torneio.id, rotulo: nome }))
        : parsed.data.clubes.map((teamId) => ({ tournament_id: torneio.id, team_id: teamId }))
      const { data: vagas, error: vagasError } = await supabase
        .from("tournament_slots")
        .insert(linhasVagas)
        .select("id")
      if (vagasError || !vagas || vagas.length === 0) {
        console.error(
          "createTournament: vagas não geradas",
          vagasError?.code ?? vagasError?.message
        )
        // Best-effort (sem transação via PostgREST): se o DELETE também
        // falhar, sobra um rascunho sem vagas — invisível ao fluxo de jogo e
        // sem partidas; o erro abaixo segue valendo.
        const { error: deleteError } = await supabase
          .from("tournaments")
          .delete()
          .eq("id", torneio.id)
          .eq("created_by", user.id)
        if (deleteError) {
          console.error(
            "createTournament: compensação falhou",
            deleteError.code ?? deleteError.message
          )
        }
        return {
          error:
            "Não foi possível criar as vagas do torneio. Nada foi salvo — tente novamente.",
        }
      } else if (!porNome) {
        // Vaga por NOME é rótulo fixo sem dono — não gera convite. Só o modo
        // clube cria slot_invites.
        // Um code por vaga. Colisão do UNIQUE global (23505, ~impossível com 80
        // bits) → regenera TODOS os codes e re-tenta o lote 1x; depois desiste
        // (os convites faltantes são regeneráveis por vaga na UI).
        for (let i = 0; i < 2; i++) {
          const { error: invitesError } = await supabase
            .from("slot_invites")
            .insert(
              vagas.map((vaga) => ({ slot_id: vaga.id, code: gerarCodigoConvite() }))
            )
          if (!invitesError) break
          console.error(
            "createTournament: convites de vaga não gerados",
            invitesError.code ?? invitesError.message
          )
          if (invitesError.code !== "23505") break
        }
      }
    } else {
      // Avulso (pessoa-cêntrico): fluxo original INTOCADO. Escritas
      // complementares (sem transação via PostgREST): falha aqui NÃO derruba o
      // torneio já criado — os estados são recuperáveis na UI da página do
      // torneio ("Participar" / "Gerar link de convite").
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
    }
  } catch (error) {
    // Falha INESPERADA das escritas no Supabase (rede, PostgREST que lança): o
    // catch some com ela atrás de mensagem genérica. Reporta ao Sentry para não
    // ficar cega — o redirect/revalidate (NEXT_REDIRECT) estão fora do try, então
    // aqui nunca chega exceção de controle de fluxo, só erro real. O scrub do
    // server config redige PII de `error.message`.
    Sentry.captureException(error, { tags: { action: "createTournament" } })
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
  tournamentId: unknown,
  /** Cadência inicial: `true` (default) gera todas as rodadas liberadas
   * (comportamento atual); `false` gera tudo OCULTO (`liberada_em = null`),
   * cabendo ao dono liberar. A pirâmide chama sem este arg ⇒ divisões nascem
   * liberadas (zero regressão). */
  liberarTudo: boolean = true
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
    // Modelo clube-cêntrico: a disputa é entre VAGAS (slot ids opacos). Não
    // há mais pré-checagem de "semeados em participants" — as vagas existem por
    // construção (criadas no rascunho) e a policy de INSERT valida que cada
    // vaga pertence ao torneio.
    const { data: vagas, error: vagasError } = await supabase
      .from("tournament_slots")
      .select("id")
      .eq("tournament_id", parsed.data)
    if (vagasError) {
      return { ok: false, error: erroGenerico }
    }

    const participantes = (vagas ?? []).map((v) => v.id)
    if (participantes.length < 2) {
      return {
        ok: false,
        error: "O torneio precisa de pelo menos 2 clubes.",
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
    // Partidas competitivas usam vaga_1/vaga_2 (NUNCA participante_1/2).
    // Cadência: liberarTudo ⇒ omite liberada_em (DEFAULT now() do banco, sem skew);
    // manual ⇒ liberada_em: null (oculta até o dono liberar).
    const partidas = rodadas.flatMap((r) =>
      r.confrontos.map(([p1, p2]) => ({
        tournament_id: parsed.data,
        vaga_1: p1,
        vaga_2: p2,
        rodada: r.rodada,
        ...(liberarTudo ? {} : { liberada_em: null }),
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

  // FREEZE — camada (a) de UX: se este torneio é uma DIVISÃO de pirâmide cuja
  // temporada está congelada (em_fluxo/encerrada), reabrir corromperia o fluxo
  // de sobe/cai já calculado. A defesa REAL é o trigger
  // `lock_division_tournament_reopen` no banco (barra o UPDATE encerrado→ativo/
  // rascunho); este guard apenas devolve a MESMA resposta de propriedade/negação
  // (sem oráculo) antes de tentar a escrita. `!inner` em league_seasons só casa
  // quando a season está congelada — 1+ linha = divisão travada.
  const { data: divisaoCongelada, error: divisaoError } = await supabase
    .from("league_division_seasons")
    .select("id, league_seasons!inner(status)")
    .eq("tournament_id", parsed.data)
    .in("league_seasons.status", ["em_fluxo", "encerrada"])
    .limit(1)
  if (divisaoError) {
    return { ok: false, error: erroGenerico }
  }
  if (divisaoCongelada && divisaoCongelada.length > 0) {
    return { ok: false, error: erroPropriedade }
  }

  // FREEZE — camada (a) também para a CLAUSURA (Fase 5.1): a meia da Clausura
  // decide a combinada → o sobe/cai, igual à Apertura. A GRANDE FINAL fica DE FORA
  // (decorativa, jogável após o fluxo). Defesa real = trigger (ramo da clausura).
  const { data: clausuraCongelada, error: clausuraError } = await supabase
    .from("league_division_seasons")
    .select("id, league_seasons!inner(status)")
    .eq("tournament_id_clausura", parsed.data)
    .in("league_seasons.status", ["em_fluxo", "encerrada"])
    .limit(1)
  if (clausuraError) {
    return { ok: false, error: erroGenerico }
  }
  if (clausuraCongelada && clausuraCongelada.length > 0) {
    return { ok: false, error: erroPropriedade }
  }

  // FREEZE — camada (a) também para a CHAVE de playoff (Fase 2): se este torneio
  // é a chave de uma fronteira cuja temporada está congelada, reabrir mudaria o
  // resultado que já gerou a N+1. Mesmo motivo/mensagem da divisão; o trigger
  // `lock_division_tournament_reopen` (2º ramo) é a defesa real.
  const { data: chaveCongelada, error: chaveError } = await supabase
    .from("league_boundaries")
    .select("id, league_seasons!inner(status)")
    .eq("playoff_tournament_id", parsed.data)
    .in("league_seasons.status", ["em_fluxo", "encerrada"])
    .limit(1)
  if (chaveError) {
    return { ok: false, error: erroGenerico }
  }
  if (chaveCongelada && chaveCongelada.length > 0) {
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
    // Vagas (slot ids opacos) no lugar de participants — ver iniciarTorneio.
    const { data: vagas, error: vagasError } = await supabase
      .from("tournament_slots")
      .select("id")
      .eq("tournament_id", tournamentId)
    if (vagasError) {
      return { error: erroGenerico }
    }

    const participantes = (vagas ?? []).map((v) => v.id)
    if (participantes.length < 2) {
      return {
        error: "O torneio precisa de pelo menos 2 clubes.",
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
    // Lados por VAGA (slot ids): o motor opera ids opacos — participante_1/2
    // do PartidaChave carrega os slot ids e mapeia para vaga_1/vaga_2.
    const partidas = gerarFaseInicial(confrontos, torneio.ida_e_volta).map(
      (p: PartidaChave) => ({
        tournament_id: tournamentId,
        vaga_1: p.participante_1,
        vaga_2: p.participante_2,
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

  // Formatos COM CHAVE: o avanço opera nas partidas com `posicao` — nos
  // formatos de grupos a chave começa após as rodadas de grupos (rodada-base
  // derivada pelo motor).
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, formato, ida_e_volta, terceiro_lugar")
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .in("formato", [...FORMATOS_COM_CHAVE])
    .eq("status", "ativo")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: erroGenerico }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }

  // BARRAGEM 'pares' (Fase 3): a chave é B confrontos 1×1 INDEPENDENTES numa
  // rodada ÚNICA — NÃO há próxima fase. Como o torneio é `mata_mata`,
  // `tamanhoChaveDasPartidas` veria 2B≥4 e inferiria uma fase 2 espúria; gerá-la
  // parearia vencedores de pares DISTINTOS e corromperia `resultadoBarragemPares`
  // (a barragem nunca ficaria `decidida` → trava o fluxo da temporada). Defesa
  // real (o PlayoffsPanel já esconde o botão; a página de torneio não).
  const { data: barragemPares, error: barragemError } = await supabase
    .from("league_boundaries")
    .select("id")
    .eq("playoff_tournament_id", parsed.data)
    .eq("modo", "barragem_cruzada")
    .eq("playoff_estilo", "pares")
    .limit(1)
  if (barragemError) {
    return { ok: false, error: erroGenerico }
  }
  if (barragemPares && barragemPares.length > 0) {
    return {
      ok: false,
      error: "A barragem em pares se decide na rodada única — não há fase a avançar.",
    }
  }

  // Lados por VAGA (slot ids). O motor consome `participante_1/2` (ids opacos)
  // — mapeamos vaga_1/vaga_2 para esse shape na leitura e de volta no INSERT.
  const { data: partidasRaw, error: partidasError } = await supabase
    .from("matches")
    .select(
      "rodada, posicao, perna, vaga_1, vaga_2, placar_1, placar_2, status, wo, wo_vencedor"
    )
    .eq("tournament_id", parsed.data)
    .not("rodada", "is", null)
  if (partidasError) {
    return { ok: false, error: erroGenerico }
  }
  if (!partidasRaw || !partidasRaw.some((p) => p.posicao !== null)) {
    return {
      ok: false,
      error:
        torneio.formato === "mata_mata"
          ? "A chave deste torneio ainda não foi gerada."
          : "Gere o mata-mata dos grupos antes de avançar fases.",
    }
  }

  const partidas = partidasRaw.map((p) => ({
    rodada: p.rodada,
    posicao: p.posicao,
    perna: p.perna,
    participante_1: p.vaga_1,
    participante_2: p.vaga_2,
    placar_1: p.placar_1,
    placar_2: p.placar_2,
    status: p.status,
    // W.O. decide o confronto inteiro (motor `decidirConfronto`); sem isto a
    // perna vira 0x0 e o avanço trava como "sem vencedor" (ou agrega errado).
    woVencedor: p.wo ? p.wo_vencedor : null,
  }))

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

  // Sem pré-checagem de "semeados em participants": as vagas são imutáveis
  // pós-rascunho (a disputa as referencia) e existem por construção; a policy
  // de INSERT valida que cada vaga pertence ao torneio. Lados por VAGA.
  const { error: insertError } = await supabase.from("matches").insert(
    novas.map((p) => ({
      tournament_id: parsed.data,
      vaga_1: p.participante_1,
      vaga_2: p.participante_2,
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

/**
 * Inicia um torneio de GRUPOS (grupos_mata_mata / fase_liga): monta os grupos
 * conforme o modo (sorteio | potes | manual — não persiste), gera o
 * round-robin de cada grupo (motor da liga, composto) e insere tudo em lote.
 *
 * ORDEM INVERTIDA em relação à liga/mata-mata (achado da validação
 * adversarial): aqui a PROMOÇÃO atômica vem ANTES do INSERT. O índice de par
 * único NÃO barra dupla geração de grupos — duas submissões concorrentes
 * sorteiam PARTIÇÕES diferentes, logo PARES diferentes, que não colidem
 * (≈43% das ordenações em N=8/G=2 escapam; provado numericamente). A única
 * serialização possível é o UPDATE filtrado por `status = 'rascunho'`: só o
 * vencedor da corrida (1 linha afetada) prossegue para o INSERT; o perdedor
 * aborta SEM inserir. `classificados_por_grupo` (K) é gravado na mesma
 * escrita — atômico com a geometria validada neste run.
 *
 * Recuperação de crash entre a promoção e o INSERT (torneio 'ativo' sem
 * partidas): o re-run REBAIXA atomicamente para 'rascunho' (UPDATE filtrado
 * por 'ativo' — dois recuperadores concorrentes também serializam aqui) e
 * refaz o fluxo normal. A página reexibe o painel de início nesse estado.
 */
export async function iniciarTorneioGrupos(
  _prevState: TournamentFormState,
  formData: FormData
): Promise<TournamentFormState> {
  const numeroOuNaN = (campo: string) => {
    const valor = formData.get(campo)
    return typeof valor === "string" && valor !== "" ? Number(valor) : Number.NaN
  }
  // Modo manual: um select por participante (name = grupo_de_<uuid>).
  const atribuicao: [string, number][] = []
  for (const [name, valor] of formData.entries()) {
    if (name.startsWith("grupo_de_") && typeof valor === "string" && valor !== "") {
      atribuicao.push([name.slice("grupo_de_".length), Number(valor)])
    }
  }

  const parsed = iniciarGruposSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    modo: formData.get("modo"),
    qtdGrupos: numeroOuNaN("qtdGrupos"),
    classificadosPorGrupo: numeroOuNaN("classificadosPorGrupo"),
    cabecas: formData.getAll("cabecas"),
    atribuicao,
  })
  if (!parsed.success) {
    return { error: "Dados da fase de grupos inválidos. Recarregue e tente novamente." }
  }
  const { tournamentId, modo, classificadosPorGrupo } = parsed.data
  // fase_liga é o caso G=1 do MESMO motor; o form dela fixa qtdGrupos em 1 e
  // a action confere contra o formato real abaixo.
  const qtdGrupos = parsed.data.qtdGrupos
  // Cadência: o default é liberar tudo (compat + testes). O dono OPTA pelo manual
  // marcando o checkbox `liberarManual` no painel ⇒ rodadas nascem ocultas.
  const liberarTudo = formData.get("liberarManual") == null

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

  // `ativo` também entra no filtro: é o estado de RECUPERAÇÃO (crash entre a
  // promoção e o INSERT) — ver o comentário da função.
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, formato, ida_e_volta, status")
    .eq("id", tournamentId)
    .eq("created_by", user.id)
    .in("formato", ["grupos_mata_mata", "fase_liga"])
    .in("status", ["rascunho", "ativo"])
    .maybeSingle()
  if (torneioError) {
    return { error: erroGenerico }
  }
  if (!torneio) {
    return { error: erroPropriedade }
  }
  if (torneio.formato === "fase_liga" && qtdGrupos !== 1) {
    return { error: "A fase de liga usa um grupo único." }
  }
  if (torneio.formato === "grupos_mata_mata" && qtdGrupos < 2) {
    return {
      error:
        "Grupos + mata-mata usa pelo menos 2 grupos — para grupo único, use o formato Fase de liga.",
    }
  }
  if (torneio.formato === "fase_liga" && modo !== "sorteio") {
    // O painel só oferece sorteio na fase de liga (potes/manual não fazem
    // sentido com grupo único); fechar o caminho de POST direto por coerência.
    return { error: "A fase de liga usa sorteio para a ordem dos confrontos." }
  }

  const { data: jaGeradas, error: geradasError } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .not("rodada", "is", null)
    .limit(1)
  if (geradasError) {
    return { error: erroGenerico }
  }
  if (jaGeradas && jaGeradas.length > 0) {
    // Partidas existem: o fluxo promote-first garante que K/status já foram
    // gravados ANTES delas — nada a fazer além de orientar.
    return { error: "O torneio já foi iniciado. Recarregue a página." }
  }

  // Recuperação de crash (ativo sem partidas): REBAIXA atomicamente — o
  // UPDATE filtrado por 'ativo' serializa dois recuperadores concorrentes
  // (só um afeta a linha) e devolve o fluxo ao caminho normal.
  if (torneio.status === "ativo") {
    const { data: rebaixado, error: rebaixaError } = await supabase
      .from("tournaments")
      .update({ status: "rascunho" })
      .eq("id", tournamentId)
      .eq("created_by", user.id)
      .eq("status", "ativo")
      .select("id")
    if (rebaixaError) {
      return { error: erroGenerico }
    }
    if (!rebaixado || rebaixado.length === 0) {
      return {
        error: "O torneio pode ter sido alterado. Recarregue e tente novamente.",
      }
    }
  }

  // Vagas (slot ids opacos) no lugar de participants — ver iniciarTorneio.
  const { data: vagas, error: vagasError } = await supabase
    .from("tournament_slots")
    .select("id")
    .eq("tournament_id", tournamentId)
  if (vagasError) {
    return { error: erroGenerico }
  }

  const participantes = (vagas ?? []).map((v) => v.id)
  if (participantes.length < 2) {
    return {
      error: "O torneio precisa de pelo menos 2 clubes.",
    }
  }
  if (participantes.length > MATA_MATA_MAX_PARTICIPANTES) {
    return {
      error: `O torneio aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} participantes.`,
    }
  }

  // Base canônica determinística (aleatoriedade SÓ pelo randInt injetado).
  participantes.sort()

  let grupos: string[][]
  try {
    validarGeometria(participantes.length, qtdGrupos, classificadosPorGrupo)
    if (modo === "sorteio") {
      grupos = montarGruposSorteio(participantes, qtdGrupos, randIntCrypto)
    } else if (modo === "potes") {
      const confirmadosSet = new Set(participantes)
      const cabecas = [...parsed.data.cabecas].sort()
      if (!cabecas.every((c) => confirmadosSet.has(c))) {
        return { error: "Cabeça de chave fora da lista de participantes." }
      }
      if (new Set(cabecas).size !== cabecas.length) {
        return { error: "Cabeça de chave repetida." }
      }
      const cabecasSet = new Set(cabecas)
      const demais = participantes.filter((p) => !cabecasSet.has(p))
      grupos = montarGruposPotes(cabecas, demais, qtdGrupos, randIntCrypto)
    } else {
      const porGrupo: string[][] = Array.from({ length: qtdGrupos }, () => [])
      for (const [participante, g] of parsed.data.atribuicao) {
        if (g < 1 || g > qtdGrupos) {
          return { error: `Grupo ${g} não existe nesta configuração.` }
        }
        porGrupo[g - 1].push(participante)
      }
      grupos = montarGruposManual(porGrupo, participantes)
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : erroGenerico }
  }

  // PROMOÇÃO ATÔMICA ANTES do INSERT — a serialização da corrida (ver o
  // comentário da função: o índice de par único NÃO cobre partições
  // divergentes de sorteio). 0 linhas = perdedor: aborta SEM inserir.
  const { data: promovido, error: updateError } = await supabase
    .from("tournaments")
    .update({ status: "ativo", classificados_por_grupo: classificadosPorGrupo })
    .eq("id", tournamentId)
    .eq("created_by", user.id)
    .eq("status", "rascunho")
    .select("id")
  if (updateError) {
    return { error: erroGenerico }
  }
  if (!promovido || promovido.length === 0) {
    return {
      error: "O torneio já foi iniciado (talvez em outra aba). Recarregue a página.",
    }
  }

  // Um único INSERT em lote: atômico (todos os grupos ou nada). Falha aqui
  // deixa o torneio 'ativo' sem partidas — o re-run recupera (rebaixa e refaz).
  // Lados por VAGA: o motor opera ids opacos (slot ids) — participante_1/2 do
  // motor carrega os slot ids e mapeia para vaga_1/vaga_2.
  const partidas = gerarPartidasGrupos(grupos, torneio.ida_e_volta).map((p) => ({
    tournament_id: tournamentId,
    vaga_1: p.participante_1,
    vaga_2: p.participante_2,
    grupo: p.grupo,
    rodada: p.rodada,
    // Cadência: liberarTudo ⇒ DEFAULT now(); manual ⇒ oculta (liberada_em null).
    ...(liberarTudo ? {} : { liberada_em: null }),
  }))
  const { error: insertError } = await supabase.from("matches").insert(partidas)
  if (insertError) {
    console.error(
      "iniciarTorneioGrupos: geração falhou",
      insertError.code ?? insertError.message
    )
    return {
      error:
        "Não foi possível gerar as partidas. Tente novamente — o início será retomado.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${tournamentId}`)
  return {}
}

export type GerarMataMataResult =
  | { ok: true; sorteioUsado: boolean }
  | { ok: false; error: string }

/**
 * Gera a CHAVE a partir dos grupos completos: classifica cada grupo
 * (computeStandings por subconjunto; empate na linha de corte → SORTEIO,
 * sinalizado para a UI avisar), cruza os classificados (G=1 bracket seeding;
 * G>=2 padrão Copa) e insere a chave em LOTE ÚNICO com rodadas CONTÍNUAS
 * (rodada-base = última rodada de grupos + 1 — evita colisão de par no
 * índice único quando G=1). Depois disso o fluxo é o do mata-mata
 * (avancarFase generalizada).
 */
export async function gerarMataMataDosGrupos(
  tournamentId: unknown
): Promise<GerarMataMataResult> {
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

  const erroGenerico = "Não foi possível gerar o mata-mata agora. Tente novamente."
  const erroPropriedade =
    "Torneio não encontrado, não iniciado ou você não é o dono dele."

  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select(
      "id, ida_e_volta, terceiro_lugar, classificados_por_grupo, pontos_vitoria, pontos_empate, pontos_derrota"
    )
    .eq("id", parsed.data)
    .eq("created_by", user.id)
    .in("formato", ["grupos_mata_mata", "fase_liga"])
    .eq("status", "ativo")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: erroGenerico }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }
  if (torneio.classificados_por_grupo === null) {
    return { ok: false, error: erroGenerico }
  }

  // Lados por VAGA (slot ids). O motor de classificação consome
  // participante_1/2 (ids opacos) — mapeamos vaga_1/vaga_2 para esse shape.
  const { data: partidasRaw, error: partidasError } = await supabase
    .from("matches")
    .select(
      "grupo, rodada, posicao, vaga_1, vaga_2, placar_1, placar_2, status, wo, wo_vencedor"
    )
    .eq("tournament_id", parsed.data)
    .not("rodada", "is", null)
  if (partidasError) {
    return { ok: false, error: erroGenerico }
  }

  const partidas = (partidasRaw ?? []).map((p) => ({
    grupo: p.grupo,
    rodada: p.rodada,
    posicao: p.posicao,
    participante_1: p.vaga_1,
    participante_2: p.vaga_2,
    placar_1: p.placar_1,
    placar_2: p.placar_2,
    status: p.status,
    // W.O. = vitória só nos pontos, zero gols (motor `computeStandings`); sem
    // isto o 0x0 conta como EMPATE e classifica o clube errado na promoção.
    woVencedor: p.wo ? p.wo_vencedor : null,
  }))

  const deGrupos = partidas.filter(
    (p): p is typeof p & { grupo: number; rodada: number } => p.grupo !== null
  )
  if (deGrupos.length === 0) {
    return { ok: false, error: "A fase de grupos ainda não foi gerada." }
  }
  if (partidas.some((p) => p.posicao !== null)) {
    return {
      ok: false,
      error: "O mata-mata já foi gerado. Recarregue a página.",
    }
  }
  const pendentes = deGrupos.filter((p) => p.status !== "encerrada").length
  if (pendentes > 0) {
    return {
      ok: false,
      error: `Ainda ${pendentes === 1 ? "falta 1 jogo" : `faltam ${pendentes} jogos`} da fase de grupos para encerrar.`,
    }
  }

  const qtdGrupos = Math.max(...deGrupos.map((p) => p.grupo))
  let confrontos: ConfrontoChave[]
  let sorteioUsado: boolean
  try {
    const resultado = classificarGrupos(
      deGrupos as PartidaGrupoJogada[],
      {
        vitoria: torneio.pontos_vitoria,
        empate: torneio.pontos_empate,
        derrota: torneio.pontos_derrota,
      },
      qtdGrupos,
      torneio.classificados_por_grupo,
      randIntCrypto
    )
    sorteioUsado = resultado.sorteioUsado
    confrontos = cruzarClassificados(resultado.classificados)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : erroGenerico }
  }

  // Sem pré-checagem de "semeados em participants": as vagas são imutáveis
  // pós-rascunho e existem por construção; a policy de INSERT valida que cada
  // vaga pertence ao torneio. Lados por VAGA.
  // Rodadas CONTÍNUAS: a chave começa após a última rodada de grupos.
  const rodadaBase = Math.max(...deGrupos.map((p) => p.rodada)) + 1
  const novas = gerarFaseInicial(confrontos, torneio.ida_e_volta, rodadaBase)
  const { error: insertError } = await supabase.from("matches").insert(
    novas.map((p) => ({
      tournament_id: parsed.data,
      vaga_1: p.participante_1,
      vaga_2: p.participante_2,
      rodada: p.rodada,
      posicao: p.posicao,
      perna: p.perna,
    }))
  )
  if (insertError) {
    console.error(
      "gerarMataMataDosGrupos: geração falhou",
      insertError.code ?? insertError.message
    )
    if (insertError.code === "23505") {
      return {
        ok: false,
        error: "O mata-mata já foi gerado (talvez em outra aba). Recarregue a página.",
      }
    }
    return { ok: false, error: erroGenerico }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsed.data}`)
  return { ok: true, sorteioUsado }
}

export type AtualizarCoresResult = { ok: true } | { ok: false; error: string }

/**
 * Atualiza as cores de exibição de um TORNEIO (change add-cores-campeonato).
 * Só o dono: a posse é validada pelo FILTRO (`created_by = user.id`) no próprio
 * UPDATE — 0 linhas cobre inexistente/alheio com a MESMA resposta (sem oráculo).
 * A RLS `tournaments_update_owner` é a segunda barreira.
 *
 * As cores são metadados de exibição (não entram nos campos travados pelos
 * triggers de lock). Passar uma cor `undefined`/vazia GRAVA null (limpa) — o Zod
 * normaliza vazio→undefined e o `?? null` persiste a remoção; assim o dono
 * consegue voltar ao tema base do app.
 */
export async function atualizarCoresTorneio(
  tournamentId: unknown,
  cores: CoresInput
): Promise<AtualizarCoresResult> {
  const parsedId = z.uuid().safeParse(tournamentId)
  if (!parsedId.success) {
    return { ok: false, error: "Torneio inválido." }
  }
  const parsedCores = coresOpcionais.safeParse(cores)
  if (!parsedCores.success) {
    return { ok: false, error: "Cor inválida. Use o formato #rrggbb." }
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
    .update({
      // `undefined` (cor vazia) ⇒ null = limpa (volta ao tema base do app).
      cor_primaria: parsedCores.data.corPrimaria ?? null,
      cor_secundaria: parsedCores.data.corSecundaria ?? null,
    })
    .eq("id", parsedId.data)
    .eq("created_by", user.id)
    .select("id")
  if (updateError) {
    return {
      ok: false,
      error: "Não foi possível atualizar as cores agora. Tente novamente.",
    }
  }
  if (!atualizados || atualizados.length === 0) {
    return {
      ok: false,
      error: "Torneio não encontrado ou você não é o dono dele.",
    }
  }

  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsedId.data}`)
  revalidatePath(`/dashboard/torneios/${parsedId.data}/cores`)
  return { ok: true }
}

export type LiberarRodadasResult =
  | { ok: true; liberadas: number }
  | { ok: false; error: string }

/**
 * Libera rodadas ocultas de um torneio (cadência manual, change
 * add-liberacao-rodadas). Só o DONO; só toca partidas com `liberada_em is null`
 * (idempotente), setando `liberada_em = now()`. O alvo define o filtro: uma
 * rodada, até uma rodada (próximas N), a fase de grupos inteira, ou tudo. A RLS
 * `matches_update_tournament_owner` é o backstop; a posse por filtro
 * `created_by` dá a mensagem precisa (molde de `fecharRodada`).
 */
export async function liberarRodadas(
  tournamentId: unknown,
  alvo: AlvoLiberacao
): Promise<LiberarRodadasResult> {
  const parsedId = z.uuid().safeParse(tournamentId)
  const parsedAlvo = alvoLiberacaoSchema.safeParse(alvo)
  if (!parsedId.success || !parsedAlvo.success) {
    return { ok: false, error: "Dados inválidos." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // Posse + estado por filtro (mesmo padrão das demais actions; sem oráculo).
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", parsedId.data)
    .eq("created_by", user.id)
    .neq("status", "encerrado")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: "Não foi possível liberar agora. Tente novamente." }
  }
  if (!torneio) {
    return {
      ok: false,
      error: "Torneio não encontrado, encerrado ou você não é o dono dele.",
    }
  }

  // UPDATE setando SÓ liberada_em, restrito ao torneio + alvo + ocultas
  // (idempotente). `.select("id")` confirma o efeito (sem ok cego).
  let query = supabase
    .from("matches")
    .update({ liberada_em: new Date().toISOString() })
    .eq("tournament_id", parsedId.data)
    .is("liberada_em", null)

  const a = parsedAlvo.data
  if (a.tipo === "rodada") {
    query = query.eq("rodada", a.rodada)
  } else if (a.tipo === "ate") {
    query = query.lte("rodada", a.rodada)
  } else if (a.tipo === "faseGrupos") {
    query = query.not("grupo", "is", null)
  }
  // "tudo": sem filtro extra (todas as ocultas do torneio).

  const { data: liberadas, error: updateError } = await query.select("id")
  if (updateError) {
    return { ok: false, error: "Não foi possível liberar agora. Tente novamente." }
  }

  revalidatePath(`/dashboard/torneios/${parsedId.data}`)
  return { ok: true, liberadas: liberadas?.length ?? 0 }
}
