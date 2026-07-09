"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { encerrarTorneio } from "@/actions/tournaments"
import {
  chaveDaOrigem,
  derivarPool,
  identidadeDe,
  validarGeometriaCopa,
  type AncoraManual,
  type LerOrigem,
} from "@/features/cup/derivacao"
import {
  lerClassificacaoFinalCopa,
  type SlotEdicao,
} from "@/features/cup/classificacaoFinalCopa"
import { gerarChaveSemeada } from "@/features/knockout/data/gerarChaveSemeada"
import {
  faseDeGruposIncompleta,
  gerarFaseGruposSemeada,
} from "@/features/groups/montarFaseGruposPiramide"
import {
  prngDeSemente,
} from "@/features/league/flowEngine"
import {
  semearPlayoffPorPosicao,
  type PartidaJogada,
} from "@/features/knockout/gerarChaveMataMata"
import {
  computeStandings,
  type PartidaClassificavel,
  type RegrasPontuacao,
} from "@/features/standings/computeStandings"
import { createClient } from "@/lib/supabase/server"
import {
  cupManualEntrySchema,
  cupRuleSchema,
  cupSchema,
} from "@/schema/cupSchema"
import type {
  IdentidadeParticipante,
  OrigemClassificacao,
  RegraQualificacao,
} from "@/features/cup/types"

/* -------------------------------------------------------------------------- */
/* Tipos de retorno (padrão do projeto)                                        */
/* -------------------------------------------------------------------------- */

export type CupFormState = {
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

export type CupResult = { ok: true } | { ok: false; error: string }

/** Retorno de `criarCopa`: id da copa (sucesso) ou erros de validação. */
export type CriarCopaResult = {
  cupId?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

/** Pontuação CBF — a classificação de grupos da copa segue o padrão do motor. */
const REGRAS_PONTOS: RegrasPontuacao = { vitoria: 3, empate: 1, derrota: 0 }

/* -------------------------------------------------------------------------- */
/* Tradução de erros das RPCs (mensagens-código → pt-BR)                       */
/* -------------------------------------------------------------------------- */

/** Mapeia exceções das RPCs de copa (montar_copa, leitura, triggers) para pt-BR. */
function mensagemDaCopa(error: { message?: string; code?: string }): string {
  const m = error.message ?? ""
  if (m.includes("AUTH_REQUIRED")) {
    return "Você precisa estar autenticado para gerir a copa."
  }
  if (m.includes("NAO_DONO")) {
    return "Você não é o dono desta copa."
  }
  if (m.includes("EDICAO_INVALIDA")) {
    return "Edição da copa não encontrada."
  }
  if (m.includes("ENTRY_DE_OUTRA_EDICAO")) {
    return "Há participante que não pertence a esta edição. Recarregue e tente de novo."
  }
  if (m.includes("COPA_HETEROGENEA")) {
    return "A copa mistura clubes e nomes livres. Ajuste os participantes para um único tipo."
  }
  if (m.includes("COPA_LOTADA")) {
    return "Participantes em excesso para a chave (máximo 32). Recorte o pool manualmente."
  }
  if (m.includes("COPA_SEM_PARTICIPANTES_SUFICIENTES")) {
    return "A copa precisa de mais participantes para montar."
  }
  if (m.includes("COPA_GEOMETRIA_INVALIDA")) {
    return "Os participantes não fecham os grupos. Ajuste a quantidade antes de montar."
  }
  // Leitura de origem (derivação).
  if (m.includes("ORIGEM_INVISIVEL")) {
    return "Uma das origens não é pública nem sua — sem permissão para ler a classificação."
  }
  if (m.includes("ORIGEM_NAO_ENCERRADA")) {
    return "Uma das origens ainda não tem temporada/edição encerrada. Aguarde o encerramento."
  }
  if (m.includes("NIVEL_INEXISTENTE")) {
    return "Um dos níveis de origem não existe na temporada consumida (a pirâmide encolheu)."
  }
  // Triggers de ciclo de vida.
  if (m.includes("CICLO_DE_COPAS")) {
    return "Essa origem criaria um ciclo entre copas (A alimenta B que alimenta A). Não é permitido."
  }
  if (m.includes("COPA_COM_EDICAO_MATERIALIZADA")) {
    return "Esta copa já tem edição montada. Arquive em vez de apagar (o histórico é preservado)."
  }
  return "Não foi possível concluir a operação na copa agora. Tente novamente."
}

/* -------------------------------------------------------------------------- */
/* Helpers de sessão/posse                                                     */
/* -------------------------------------------------------------------------- */

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/** Sessão obrigatória. Retorna o user ou um erro padronizado. */
async function exigirSessao(
  supabase: SupabaseServer
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, error: "Sessão expirada. Entre novamente." }
  }
  return { ok: true, userId: user.id }
}

/**
 * Posse DIRETA da copa (D9): a copa é gerida só pelo dono — `created_by` direto,
 * sem helper de capacidade. Retorna a copa-mãe (campos úteis) ou null se não é dono.
 */
async function carregarCopaDoDono(
  supabase: SupabaseServer,
  cupId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("cup_competitions")
    .select(
      "id, created_by, formato, por_nome, qtd_grupos, classificados_por_grupo, status"
    )
    .eq("id", cupId)
    .maybeSingle()
  if (error || !data || data.created_by !== userId) return null
  return data
}

/**
 * Carrega a edição + copa-mãe, validando posse direta. Retorna o agregado ou null.
 */
async function carregarEdicaoDoDono(
  supabase: SupabaseServer,
  cupSeasonId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("cup_seasons")
    .select(
      `id, numero, status, tournament_id, config_snapshot,
       cup_competitions!inner ( id, created_by, formato, por_nome, ida_e_volta, terceiro_lugar,
                                 qtd_grupos, classificados_por_grupo, desempate_criterio )`
    )
    .eq("id", cupSeasonId)
    .maybeSingle()
  if (error || !data) return null
  const copa = data.cup_competitions as unknown as {
    id: string
    created_by: string | null
    formato: "mata_mata" | "grupos_mata_mata"
    por_nome: boolean
    ida_e_volta: boolean
    terceiro_lugar: boolean
    qtd_grupos: number | null
    classificados_por_grupo: number | null
    desempate_criterio: string
  }
  if (copa.created_by !== userId) return null
  return {
    id: data.id,
    numero: data.numero,
    status: data.status,
    tournamentId: data.tournament_id,
    configSnapshot: data.config_snapshot,
    copa,
  }
}

/* -------------------------------------------------------------------------- */
/* criarCopa — cria cup_competitions + regras                                  */
/* -------------------------------------------------------------------------- */

const criarCopaSchema = cupSchema
const criarCopaRulesSchema = z.array(cupRuleSchema).max(64, { error: "Regras em excesso." })

/**
 * Cria uma COPA (config-mãe) + suas regras de qualificação. `created_by` é do
 * SERVIDOR (a RLS é a 2ª barreira). Consentimento de origem (pública ou do próprio
 * dono) e homogeneidade `por_nome` são best-effort aqui — a autoridade do
 * consentimento são as RPCs de leitura (ORIGEM_INVISIVEL) e da homogeneidade é
 * `montar_copa` (COPA_HETEROGENEA). O anti-ciclo é trigger no banco (capturamos
 * CICLO_DE_COPAS). Não-transacional: a primeira falha compensa apagando a copa.
 */
export async function criarCopa(input: {
  copa: unknown
  regras?: unknown
}): Promise<CriarCopaResult> {
  const parsedCopa = criarCopaSchema.safeParse(input.copa)
  if (!parsedCopa.success) {
    return {
      error: "Verifique os campos destacados.",
      fieldErrors: z.flattenError(parsedCopa.error).fieldErrors,
    }
  }
  const parsedRegras = criarCopaRulesSchema.safeParse(input.regras ?? [])
  if (!parsedRegras.success) {
    return { error: "Verifique as regras de qualificação." }
  }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { error: sessao.error }

  const dados = parsedCopa.data
  const erroGenerico =
    "Não foi possível criar a copa agora. Nada foi salvo — tente novamente."

  // (1) Copa (config-mãe). created_by no servidor.
  const { data: copa, error: copaError } = await supabase
    .from("cup_competitions")
    .insert({
      nome: dados.nome,
      created_by: sessao.userId,
      abrangencia: dados.abrangencia,
      formato: dados.formato,
      por_nome: dados.porNome,
      ida_e_volta: dados.idaEVolta,
      terceiro_lugar: dados.terceiroLugar,
      qtd_grupos: dados.formato === "grupos_mata_mata" ? (dados.qtdGrupos ?? null) : null,
      classificados_por_grupo:
        dados.formato === "grupos_mata_mata" ? (dados.classificadosPorGrupo ?? null) : null,
      desempate_criterio: dados.desempateCriterio,
      is_public: dados.isPublic,
      cor_primaria: dados.corPrimaria ?? null,
      cor_secundaria: dados.corSecundaria ?? null,
    })
    .select("id")
    .single()
  if (copaError || !copa) {
    console.error("criarCopa: copa", copaError?.code ?? copaError?.message)
    return { error: erroGenerico }
  }
  const cupId = copa.id

  const compensar = async () => {
    const { error } = await supabase
      .from("cup_competitions")
      .delete()
      .eq("id", cupId)
      .eq("created_by", sessao.userId)
    if (error) {
      console.error("criarCopa: compensação falhou", error.code ?? error.message)
    }
  }

  // (2) Regras de qualificação (opcionais — podem ser adicionadas depois).
  if (parsedRegras.data.length > 0) {
    const consentimento = await validarConsentimentoRegras(
      supabase,
      parsedRegras.data,
      sessao.userId
    )
    if (!consentimento.ok) {
      await compensar()
      return { error: consentimento.error }
    }

    const linhas = parsedRegras.data.map((r) => ({
      cup_competition_id: cupId,
      origem_tipo: r.origemTipo,
      origem_competition_id: r.origemTipo === "divisao" ? (r.origemCompetitionId ?? null) : null,
      origem_nivel: r.origemTipo === "divisao" ? (r.origemNivel ?? null) : null,
      origem_cup_id: r.origemTipo === "copa" ? (r.origemCupId ?? null) : null,
      posicao_inicio: r.posicaoInicio,
      posicao_fim: r.posicaoFim,
      prioridade: r.prioridade,
      rotulo: r.rotulo ?? null,
    }))
    const { error: regrasError } = await supabase
      .from("cup_qualification_rules")
      .insert(linhas)
    if (regrasError) {
      // O trigger anti-ciclo dispara aqui (CICLO_DE_COPAS).
      await compensar()
      return { error: mensagemDaCopa(regrasError) }
    }
  }

  revalidatePath("/dashboard/copas")
  return { cupId }
}

/**
 * Consentimento best-effort: cada regra só pode apontar para origem PÚBLICA ou do
 * PRÓPRIO dono. A autoridade é a RPC de leitura (ORIGEM_INVISIVEL); aqui antecipamos
 * o erro com mensagem amigável. Lê is_public/created_by da origem; origem invisível
 * pela RLS retorna null → bloqueamos.
 */
async function validarConsentimentoRegras(
  supabase: SupabaseServer,
  regras: Array<z.infer<typeof cupRuleSchema>>,
  userId: string
): Promise<CupResult> {
  const competitionIds = [
    ...new Set(
      regras
        .filter((r) => r.origemTipo === "divisao")
        .map((r) => r.origemCompetitionId)
        .filter((id): id is string => id != null)
    ),
  ]
  const cupIds = [
    ...new Set(
      regras
        .filter((r) => r.origemTipo === "copa")
        .map((r) => r.origemCupId)
        .filter((id): id is string => id != null)
    ),
  ]

  if (competitionIds.length > 0) {
    const { data, error } = await supabase
      .from("league_competitions")
      .select("id, is_public, created_by")
      .in("id", competitionIds)
    if (error) return { ok: false, error: "Não foi possível validar as origens. Tente novamente." }
    const visiveis = new Set(
      (data ?? [])
        .filter((c) => c.is_public || c.created_by === userId)
        .map((c) => c.id)
    )
    if (competitionIds.some((id) => !visiveis.has(id))) {
      return {
        ok: false,
        error: "Uma das pirâmides de origem não é pública nem sua. Só dá para usar origens visíveis.",
      }
    }
  }

  if (cupIds.length > 0) {
    const { data, error } = await supabase
      .from("cup_competitions")
      .select("id, is_public, created_by")
      .in("id", cupIds)
    if (error) return { ok: false, error: "Não foi possível validar as origens. Tente novamente." }
    const visiveis = new Set(
      (data ?? [])
        .filter((c) => c.is_public || c.created_by === userId)
        .map((c) => c.id)
    )
    if (cupIds.some((id) => !visiveis.has(id))) {
      return {
        ok: false,
        error: "Uma das copas de origem não é pública nem sua. Só dá para usar origens visíveis.",
      }
    }
  }

  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* editarRegrasCopa — substitui o conjunto de regras                           */
/* -------------------------------------------------------------------------- */

const cupIdSchema = z.uuid({ error: "Copa inválida." })
const cupSeasonIdSchema = z.uuid({ error: "Edição inválida." })

/**
 * SUBSTITUI o conjunto de regras de uma copa (delete-all + insert). Revalida o
 * consentimento (best-effort) e deixa o trigger anti-ciclo barrar ciclos
 * (CICLO_DE_COPAS). Apenas o dono (posse direta + RLS). As entries já derivadas
 * preservam `origem_rule_id` via SET NULL no banco; re-derivar repovoa.
 */
export async function editarRegrasCopa(
  cupId: unknown,
  regras: unknown
): Promise<CupResult> {
  const parsedId = cupIdSchema.safeParse(cupId)
  if (!parsedId.success) return { ok: false, error: "Copa inválida." }
  const parsedRegras = criarCopaRulesSchema.safeParse(regras)
  if (!parsedRegras.success) {
    return { ok: false, error: "Verifique as regras de qualificação." }
  }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const copa = await carregarCopaDoDono(supabase, parsedId.data, sessao.userId)
  if (!copa) {
    return { ok: false, error: "Copa não encontrada ou você não é o dono dela." }
  }

  const consentimento = await validarConsentimentoRegras(
    supabase,
    parsedRegras.data,
    sessao.userId
  )
  if (!consentimento.ok) return consentimento

  // Substituição: apaga as regras atuais e insere o novo conjunto.
  const { error: delError } = await supabase
    .from("cup_qualification_rules")
    .delete()
    .eq("cup_competition_id", parsedId.data)
  if (delError) {
    return { ok: false, error: "Não foi possível atualizar as regras agora. Tente novamente." }
  }

  if (parsedRegras.data.length > 0) {
    const linhas = parsedRegras.data.map((r) => ({
      cup_competition_id: parsedId.data,
      origem_tipo: r.origemTipo,
      origem_competition_id: r.origemTipo === "divisao" ? (r.origemCompetitionId ?? null) : null,
      origem_nivel: r.origemTipo === "divisao" ? (r.origemNivel ?? null) : null,
      origem_cup_id: r.origemTipo === "copa" ? (r.origemCupId ?? null) : null,
      posicao_inicio: r.posicaoInicio,
      posicao_fim: r.posicaoFim,
      prioridade: r.prioridade,
      rotulo: r.rotulo ?? null,
    }))
    const { error: insError } = await supabase
      .from("cup_qualification_rules")
      .insert(linhas)
    if (insError) {
      return { ok: false, error: mensagemDaCopa(insError) }
    }
  }

  revalidatePath(`/dashboard/copas/${parsedId.data}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* criarEdicaoCopa — cria cup_seasons (rascunho, numero = max+1)               */
/* -------------------------------------------------------------------------- */

/**
 * Cria uma EDIÇÃO em rascunho: `numero` = max+1 daquela copa, `previous_season_id`
 * = a edição de maior numero (cadeia de proveniência). Sentinela única
 * (cup_seasons_numero_unico) cobre corrida (23505 → o dono recarrega). Só o dono.
 * Retorna `{ ok, cupSeasonId? }` para a UI navegar.
 */
export async function criarEdicaoCopa(
  cupId: unknown
): Promise<{ ok: true; cupSeasonId: string } | { ok: false; error: string }> {
  const parsedId = cupIdSchema.safeParse(cupId)
  if (!parsedId.success) return { ok: false, error: "Copa inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const copa = await carregarCopaDoDono(supabase, parsedId.data, sessao.userId)
  if (!copa) {
    return { ok: false, error: "Copa não encontrada ou você não é o dono dela." }
  }

  // Edição de maior numero (base do numero da nova + cadeia de proveniência).
  const { data: ultima, error: ultimaError } = await supabase
    .from("cup_seasons")
    .select("id, numero")
    .eq("cup_competition_id", parsedId.data)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ultimaError) {
    return { ok: false, error: "Não foi possível criar a edição agora. Tente novamente." }
  }

  const numero = (ultima?.numero ?? 0) + 1
  const { data: nova, error: novaError } = await supabase
    .from("cup_seasons")
    .insert({
      cup_competition_id: parsedId.data,
      numero,
      status: "rascunho",
      previous_season_id: ultima?.id ?? null,
    })
    .select("id")
    .single()
  if (novaError || !nova) {
    // 23505 = corrida na sentinela de numero; o dono recarrega e acha a criada.
    return { ok: false, error: "Não foi possível criar a edição agora. Tente novamente." }
  }

  revalidatePath(`/dashboard/copas/${parsedId.data}`)
  return { ok: true, cupSeasonId: nova.id }
}

/* -------------------------------------------------------------------------- */
/* derivarVagasCopa — RPCs de leitura → derivarPool → grava cup_entries        */
/* -------------------------------------------------------------------------- */

/** Resultado de `derivarVagasCopa`: o pool gravado + lacunas para a UI avisar. */
export type DerivarVagasResult =
  | {
      ok: true
      /** Nº de entries efetivas gravadas (manuais + derivadas). */
      total: number
      /** Vagas que ficaram vazias (origem esgotada) — para a UI sinalizar. */
      lacunas: { origemRuleId: string; origemDescricao: string | null }[]
    }
  | { ok: false; error: string }

/**
 * Deriva o pool de participantes de uma edição em rascunho: lê as regras da copa,
 * chama a RPC de leitura por ORIGEM distinta (cache por `chaveDaOrigem` — nunca lê a
 * mesma origem 2x), monta `lerOrigem`, carrega as âncoras manuais (cup_entries
 * manual=true) e as exclusões persistentes, roda `derivarPool` (motor puro) e
 * SUBSTITUI as entries NÃO-manuais pelo novo pool (preserva as manuais). Enriquece
 * `origem_descricao` com nomes reais (pirâmide/copa). Propaga
 * ORIGEM_INVISIVEL/ORIGEM_NAO_ENCERRADA/NIVEL_INEXISTENTE. Só o dono; só em rascunho.
 */
export async function derivarVagasCopa(
  cupSeasonId: unknown
): Promise<DerivarVagasResult> {
  const parsedId = cupSeasonIdSchema.safeParse(cupSeasonId)
  if (!parsedId.success) return { ok: false, error: "Edição inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const edicao = await carregarEdicaoDoDono(supabase, parsedId.data, sessao.userId)
  if (!edicao) {
    return { ok: false, error: "Edição não encontrada ou você não é o dono dela." }
  }
  if (edicao.status !== "rascunho") {
    return { ok: false, error: "Só dá para derivar vagas enquanto a edição é rascunho." }
  }

  // Regras da copa.
  const { data: regrasRaw, error: regrasError } = await supabase
    .from("cup_qualification_rules")
    .select(
      "id, cup_competition_id, origem_tipo, origem_competition_id, origem_nivel, origem_cup_id, posicao_inicio, posicao_fim, prioridade, rotulo, created_at"
    )
    .eq("cup_competition_id", edicao.copa.id)
  if (regrasError) {
    return { ok: false, error: "Não foi possível carregar as regras agora. Tente novamente." }
  }
  const regras = (regrasRaw ?? []) as RegraQualificacao[]

  // Âncoras manuais e exclusões persistentes ATUAIS.
  const { data: manuaisRaw, error: manuaisError } = await supabase
    .from("cup_entries")
    .select("id, team_id, rotulo")
    .eq("cup_season_id", parsedId.data)
    .eq("manual", true)
  if (manuaisError) {
    return { ok: false, error: "Não foi possível carregar os ajustes manuais. Tente novamente." }
  }
  const manuais: AncoraManual[] = (manuaisRaw ?? []).map((m) => ({
    team_id: m.team_id,
    rotulo: m.rotulo,
  }))

  const { data: exclRaw, error: exclError } = await supabase
    .from("cup_season_exclusions")
    .select("team_id, rotulo")
    .eq("cup_season_id", parsedId.data)
  if (exclError) {
    return { ok: false, error: "Não foi possível carregar as exclusões. Tente novamente." }
  }
  const exclusoes = new Set<IdentidadeParticipante>(
    (exclRaw ?? []).map((x) => identidadeDe(x.team_id, x.rotulo))
  )

  // Lê cada ORIGEM distinta via RPC gated, cacheando por chave de origem. Um erro
  // de leitura (ORIGEM_*) aborta a derivação inteira com mensagem amigável.
  const cacheOrigem = new Map<string, OrigemClassificacao[]>()
  let erroLeitura: string | null = null
  for (const regra of regras) {
    if (erroLeitura) break
    const chave = chaveDaOrigem(regra)
    if (cacheOrigem.has(chave)) continue
    try {
      const lista = await lerOrigemViaRpc(supabase, regra)
      cacheOrigem.set(chave, lista)
    } catch (e) {
      erroLeitura =
        e instanceof Error ? mensagemDaCopa({ message: e.message }) : mensagemDaCopa({})
    }
  }
  if (erroLeitura) {
    return { ok: false, error: erroLeitura }
  }

  // Motor puro: lerOrigem resolve do cache (já populado por origem).
  const lerOrigem: LerOrigem = (regra) => cacheOrigem.get(chaveDaOrigem(regra)) ?? []
  const pool = derivarPool(regras, lerOrigem, manuais, exclusoes)

  // Enriquece origem_descricao com nomes reais (pirâmide/copa) — uma resolução por id.
  const nomesOrigem = await resolverNomesDeOrigem(supabase, regras)

  // Substitui as entries NÃO-manuais pelo novo pool (preserva as manuais). As
  // manuais já estão no banco e foram incluídas no pool como âncoras — não regrava.
  // TODO(follow-up): tornar a re-derivação atômica (RPC SECURITY DEFINER) — hoje
  // delete+insert são transações separadas; falha deixa o pool recuperável re-derivando.
  const { error: delError } = await supabase
    .from("cup_entries")
    .delete()
    .eq("cup_season_id", parsedId.data)
    .eq("manual", false)
  if (delError) {
    return { ok: false, error: "Não foi possível atualizar o pool agora. Tente novamente." }
  }

  // Reposiciona o seed das manuais conforme a ordem do pool e insere as derivadas.
  // (As manuais entram primeiro no pool — atualizamos seu seed; as derivadas são
  // novas linhas.)
  const derivadas = pool.entradas.filter((e) => !e.manual)
  const manuaisPool = pool.entradas.filter((e) => e.manual)

  // Atualiza o seed de cada âncora manual pela identidade.
  if (manuaisPool.length > 0 && manuaisRaw) {
    const idPorIdentidade = new Map<IdentidadeParticipante, string>()
    for (const m of manuaisRaw) {
      idPorIdentidade.set(identidadeDe(m.team_id, m.rotulo), m.id)
    }
    for (const e of manuaisPool) {
      const entryId = idPorIdentidade.get(e.identidade)
      if (!entryId) continue
      await supabase.from("cup_entries").update({ seed: e.seed }).eq("id", entryId)
    }
  }

  if (derivadas.length > 0) {
    const linhas = derivadas.map((e) => ({
      cup_season_id: parsedId.data,
      team_id: e.team_id,
      rotulo: e.rotulo,
      // Elo da herança de técnico: só a entry por-clube de origem-divisão o traz.
      competitor_id: e.competitor_id,
      origem_rule_id: e.origem_rule_id,
      origem_season_id: e.origem_season_id,
      origem_descricao: enriquecerDescricao(e.origem_descricao, e.origem_rule_id, nomesOrigem),
      seed: e.seed,
      manual: false,
    }))
    const { error: insError } = await supabase.from("cup_entries").insert(linhas)
    if (insError) {
      return { ok: false, error: "Não foi possível gravar o pool agora. Tente novamente." }
    }
  }

  revalidatePath(`/dashboard/copas/edicao/${parsedId.data}`)
  return {
    ok: true,
    total: pool.entradas.length,
    lacunas: pool.lacunas.map((l) => ({
      origemRuleId: l.origem_rule_id,
      origemDescricao: enriquecerDescricao(l.origem_descricao, l.origem_rule_id, nomesOrigem),
    })),
  }
}

/**
 * Lê a classificação final de UMA origem via RPC DEFINER gated, devolvendo as linhas
 * no shape `OrigemClassificacao`. Lança um Error com a mensagem-código (ORIGEM_*)
 * para o chamador traduzir. NÃO chamar 2x a mesma origem (o chamador cacheia).
 */
async function lerOrigemViaRpc(
  supabase: SupabaseServer,
  regra: RegraQualificacao
): Promise<OrigemClassificacao[]> {
  if (regra.origem_tipo === "divisao") {
    const { data, error } = await supabase.rpc("classificacao_final_divisao", {
      p_competition_id: regra.origem_competition_id!,
      p_nivel: regra.origem_nivel!,
    })
    if (error) throw new Error(error.message)
    return (data ?? []).map((l) => ({
      team_id: l.team_id,
      rotulo: l.rotulo,
      posicao_final: l.posicao_final,
      rank: l.rank,
      origem_season_id: l.origem_season_id,
      // Proveniência de liga (add-copa-tecnico-heranca): só a origem-DIVISÃO expõe.
      competitor_id: l.competitor_id,
    }))
  }
  const { data, error } = await supabase.rpc("classificacao_final_copa", {
    p_cup_id: regra.origem_cup_id!,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => ({
    team_id: l.team_id,
    rotulo: l.rotulo,
    posicao_final: l.posicao_final,
    rank: l.rank,
    origem_season_id: l.origem_season_id,
    // Origem-COPA não carrega league_competitor → sem herança de técnico.
    competitor_id: null,
  }))
}

/** Nome legível de uma origem por rule_id (pirâmide nível N / copa). */
type NomesDeOrigem = Map<string, string>

async function resolverNomesDeOrigem(
  supabase: SupabaseServer,
  regras: RegraQualificacao[]
): Promise<NomesDeOrigem> {
  const out: NomesDeOrigem = new Map()
  const competitionIds = [
    ...new Set(
      regras
        .filter((r) => r.origem_tipo === "divisao")
        .map((r) => r.origem_competition_id)
        .filter((id): id is string => id != null)
    ),
  ]
  const cupIds = [
    ...new Set(
      regras
        .filter((r) => r.origem_tipo === "copa")
        .map((r) => r.origem_cup_id)
        .filter((id): id is string => id != null)
    ),
  ]

  const nomePorComp = new Map<string, string>()
  if (competitionIds.length > 0) {
    const { data } = await supabase
      .from("league_competitions")
      .select("id, nome")
      .in("id", competitionIds)
    for (const c of data ?? []) nomePorComp.set(c.id, c.nome)
  }
  const nomePorCup = new Map<string, string>()
  if (cupIds.length > 0) {
    const { data } = await supabase.from("cup_competitions").select("id, nome").in("id", cupIds)
    for (const c of data ?? []) nomePorCup.set(c.id, c.nome)
  }

  for (const r of regras) {
    if (r.origem_tipo === "divisao" && r.origem_competition_id) {
      const nome = nomePorComp.get(r.origem_competition_id)
      if (nome) out.set(r.id, `${nome} (nível ${r.origem_nivel})`)
    } else if (r.origem_tipo === "copa" && r.origem_cup_id) {
      const nome = nomePorCup.get(r.origem_cup_id)
      if (nome) out.set(r.id, nome)
    }
  }
  return out
}

/** Junta a descrição do motor ("4º") com o nome real da origem ("Série A (nível 1)"). */
function enriquecerDescricao(
  base: string | null,
  ruleId: string | null,
  nomes: NomesDeOrigem
): string | null {
  const nome = ruleId ? nomes.get(ruleId) : null
  if (base && nome) return `${base} — ${nome}`
  return base ?? nome ?? null
}

/* -------------------------------------------------------------------------- */
/* ajustarParticipantesCopa — adicionar/remover/reordenar (só rascunho)        */
/* -------------------------------------------------------------------------- */

/** Ações de ajuste manual do pool. */
export type AjusteParticipante =
  | { tipo: "adicionar"; teamId?: string; rotulo?: string }
  | { tipo: "remover"; entryId: string }
  | { tipo: "reordenar"; ordemEntryIds: string[] }

/**
 * Ajusta manualmente os participantes de uma edição em rascunho:
 * - **adicionar**: valida `cupManualEntrySchema` (coerente com por_nome), recusa
 *   PARTICIPANTE_DUPLICADO por identidade (clube ou rótulo normalizado), insere
 *   `manual=true`.
 * - **remover**: se a entry era DERIVADA, grava a identidade em
 *   `cup_season_exclusions` (persiste na re-derivação); remove a entry.
 * - **reordenar**: regrava `seed` na ordem dada (1-based).
 * Só o dono; só em rascunho.
 */
export async function ajustarParticipantesCopa(
  cupSeasonId: unknown,
  acao: AjusteParticipante
): Promise<CupResult> {
  const parsedId = cupSeasonIdSchema.safeParse(cupSeasonId)
  if (!parsedId.success) return { ok: false, error: "Edição inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const edicao = await carregarEdicaoDoDono(supabase, parsedId.data, sessao.userId)
  if (!edicao) {
    return { ok: false, error: "Edição não encontrada ou você não é o dono dela." }
  }
  if (edicao.status !== "rascunho") {
    return { ok: false, error: "Só dá para ajustar participantes enquanto a edição é rascunho." }
  }

  const revalidar = () =>
    revalidatePath(`/dashboard/copas/edicao/${parsedId.data}`)

  if (acao.tipo === "adicionar") {
    const parsed = cupManualEntrySchema.safeParse({
      porNome: edicao.copa.por_nome,
      teamId: acao.teamId,
      rotulo: acao.rotulo,
    })
    if (!parsed.success) {
      return { ok: false, error: "Verifique os dados do participante." }
    }
    const teamId = edicao.copa.por_nome ? null : (parsed.data.teamId ?? null)
    const rotulo = edicao.copa.por_nome ? (parsed.data.rotulo ?? null) : null
    const identidade = identidadeDe(teamId, rotulo)

    // Recusa duplicata por identidade (clube ou rótulo normalizado).
    const { data: existentes, error: exError } = await supabase
      .from("cup_entries")
      .select("team_id, rotulo")
      .eq("cup_season_id", parsedId.data)
    if (exError) {
      return { ok: false, error: "Não foi possível validar a duplicata. Tente novamente." }
    }
    const jaPresente = (existentes ?? []).some(
      (e) => identidadeDe(e.team_id, e.rotulo) === identidade
    )
    if (jaPresente) {
      return { ok: false, error: "Esse participante já está na edição." }
    }

    // Seed = próximo (último + 1) para entrar no fim do pool.
    const { data: maxSeed } = await supabase
      .from("cup_entries")
      .select("seed")
      .eq("cup_season_id", parsedId.data)
      .order("seed", { ascending: false })
      .limit(1)
      .maybeSingle()
    const seed = (maxSeed?.seed ?? 0) + 1

    const { error: insError } = await supabase.from("cup_entries").insert({
      cup_season_id: parsedId.data,
      team_id: teamId,
      rotulo,
      seed,
      manual: true,
    })
    if (insError) {
      // 23505 = UNIQUE de identidade (corrida) → mesma mensagem de duplicata.
      if (insError.code === "23505") {
        return { ok: false, error: "Esse participante já está na edição." }
      }
      return { ok: false, error: "Não foi possível adicionar o participante. Tente novamente." }
    }
    revalidar()
    return { ok: true }
  }

  if (acao.tipo === "remover") {
    const parsedEntry = z.uuid().safeParse(acao.entryId)
    if (!parsedEntry.success) return { ok: false, error: "Participante inválido." }

    const { data: entry, error: entryError } = await supabase
      .from("cup_entries")
      .select("id, team_id, rotulo, manual")
      .eq("id", parsedEntry.data)
      .eq("cup_season_id", parsedId.data)
      .maybeSingle()
    if (entryError) {
      return { ok: false, error: "Não foi possível remover o participante. Tente novamente." }
    }
    if (!entry) {
      return { ok: false, error: "Participante não encontrado nesta edição." }
    }

    // Entry DERIVADA → registra exclusão persistente (não reaparece na re-derivação).
    if (!entry.manual) {
      const { error: exclError } = await supabase.from("cup_season_exclusions").insert({
        cup_season_id: parsedId.data,
        team_id: entry.team_id,
        rotulo: entry.rotulo,
      })
      // 23505 = já excluída (idempotente) — segue para remover a entry.
      if (exclError && exclError.code !== "23505") {
        return { ok: false, error: "Não foi possível registrar a exclusão. Tente novamente." }
      }
    }

    const { error: delError } = await supabase
      .from("cup_entries")
      .delete()
      .eq("id", parsedEntry.data)
      .eq("cup_season_id", parsedId.data)
    if (delError) {
      return { ok: false, error: "Não foi possível remover o participante. Tente novamente." }
    }
    revalidar()
    return { ok: true }
  }

  // reordenar.
  const parsedOrdem = z.array(z.uuid()).max(64).safeParse(acao.ordemEntryIds)
  if (!parsedOrdem.success) return { ok: false, error: "Ordem inválida." }

  // Confere que a ordem cobre exatamente as entries da edição.
  const { data: todas, error: todasError } = await supabase
    .from("cup_entries")
    .select("id")
    .eq("cup_season_id", parsedId.data)
  if (todasError) {
    return { ok: false, error: "Não foi possível reordenar agora. Tente novamente." }
  }
  const idsEdicao = new Set((todas ?? []).map((e) => e.id))
  if (
    parsedOrdem.data.length !== idsEdicao.size ||
    !parsedOrdem.data.every((id) => idsEdicao.has(id))
  ) {
    return { ok: false, error: "A ordem precisa cobrir todos os participantes da edição." }
  }

  // Regrava seed 1-based na ordem. Sequência de updates (PostgREST não transaciona).
  for (let i = 0; i < parsedOrdem.data.length; i++) {
    const { error } = await supabase
      .from("cup_entries")
      .update({ seed: i + 1 })
      .eq("id", parsedOrdem.data[i])
      .eq("cup_season_id", parsedId.data)
    if (error) {
      return { ok: false, error: "Não foi possível reordenar agora. Tente novamente." }
    }
  }
  revalidar()
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* montarEdicaoCopa — wrapper da RPC montar_copa                               */
/* -------------------------------------------------------------------------- */

/**
 * Monta a edição: lê as cup_entries ordenadas por seed → array de ids, valida a
 * GEOMETRIA no app (erro amigável ANTES da RPC), chama `montar_copa` (cria o
 * tournaments rascunho + slots na ordem de seeding), traduz os erros e revalida.
 * Idempotente pela sentinela `cup_seasons.tournament_id` na RPC. Só o dono.
 */
export async function montarEdicaoCopa(cupSeasonId: unknown): Promise<CupResult> {
  const parsedId = cupSeasonIdSchema.safeParse(cupSeasonId)
  if (!parsedId.success) return { ok: false, error: "Edição inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const edicao = await carregarEdicaoDoDono(supabase, parsedId.data, sessao.userId)
  if (!edicao) {
    return { ok: false, error: "Edição não encontrada ou você não é o dono dela." }
  }
  if (edicao.status !== "rascunho") {
    return { ok: false, error: "Esta edição já foi montada." }
  }

  // Entries ordenadas por seed → ids semeados.
  const { data: entries, error: entriesError } = await supabase
    .from("cup_entries")
    .select("id, seed")
    .eq("cup_season_id", parsedId.data)
    .order("seed", { ascending: true })
  if (entriesError) {
    return { ok: false, error: "Não foi possível montar a edição agora. Tente novamente." }
  }
  const seededIds = (entries ?? []).map((e) => e.id)
  const n = seededIds.length

  // Geometria no app (erro amigável antes da RPC).
  const geometria = validarGeometriaCopa(
    edicao.copa.formato,
    n,
    edicao.copa.qtd_grupos,
    edicao.copa.classificados_por_grupo
  )
  if (!geometria.ok) {
    return { ok: false, error: geometria.mensagem }
  }

  const { error: rpcError } = await supabase.rpc("montar_copa", {
    p_cup_season_id: parsedId.data,
    p_seeded_entry_ids: seededIds,
  })
  if (rpcError) {
    return { ok: false, error: mensagemDaCopa(rpcError) }
  }

  revalidatePath(`/dashboard/copas/edicao/${parsedId.data}`)
  revalidatePath(`/dashboard/copas/${edicao.copa.id}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* iniciarEdicaoCopa — gera a chave/grupos e promove a edição para 'ativa'     */
/* -------------------------------------------------------------------------- */

/** Forma do config_snapshot gravado por montar_copa. */
interface ConfigSnapshot {
  formato: string
  por_nome: boolean
  ida_e_volta: boolean
  terceiro_lugar: boolean
  qtd_grupos: number | null
  classificados_por_grupo: number | null
  desempate_criterio: string
  n: number
}

/**
 * Inicia uma edição montada: mata-mata → ordena os slots por `cup_entries.seed`
 * (canal de seeding — independe de competitor_id; uma vaga por-clube herdada de
 * divisão o traz, por-nome/copa/manual não) e gera a chave via
 * `semearPlayoffPorPosicao` + `gerarChaveSemeada` (sem remap). grupos_mata_mata →
 * lê qtd_grupos/classificados do `config_snapshot` e gera a fase via
 * `gerarFaseGruposSemeada` (sorteio semeado pelo id da edição). Promove
 * `cup_seasons.status='ativa'`. Idempotente pelos geradores. Só o dono.
 */
export async function iniciarEdicaoCopa(cupSeasonId: unknown): Promise<CupResult> {
  const parsedId = cupSeasonIdSchema.safeParse(cupSeasonId)
  if (!parsedId.success) return { ok: false, error: "Edição inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const edicao = await carregarEdicaoDoDono(supabase, parsedId.data, sessao.userId)
  if (!edicao) {
    return { ok: false, error: "Edição não encontrada ou você não é o dono dela." }
  }
  if (!edicao.tournamentId) {
    return { ok: false, error: "Monte a edição antes de iniciá-la." }
  }
  if (edicao.status === "ativa" || edicao.status === "encerrada") {
    return { ok: false, error: "Esta edição já foi iniciada." }
  }
  // Só uma edição em status 'montada' (chave/grupos materializados pela RPC, mas
  // ainda não gerados) pode ser iniciada. 'rascunho' (sem chave) cai aqui com erro
  // claro em vez de tentar gerar sobre uma edição não-montada.
  if (edicao.status !== "montada") {
    return { ok: false, error: "Monte a edição antes de iniciá-la." }
  }

  const snapshot = (edicao.configSnapshot ?? {}) as unknown as Partial<ConfigSnapshot>
  const formato = edicao.copa.formato

  if (formato === "mata_mata") {
    // Slots na ORDEM de seeding: liga cup_entries.seed → slot_id. O canal de
    // seeding é cup_entries.seed (independe de competitor_id, que só a vaga
    // por-clube herdada de divisão carrega).
    const { data: entries, error: entriesError } = await supabase
      .from("cup_entries")
      .select("slot_id, seed")
      .eq("cup_season_id", parsedId.data)
      .not("slot_id", "is", null)
      .order("seed", { ascending: true })
    if (entriesError) {
      return { ok: false, error: "Não foi possível iniciar a edição agora. Tente novamente." }
    }
    const slotIds = (entries ?? [])
      .map((e) => e.slot_id)
      .filter((id): id is string => id != null)
    if (slotIds.length < 2) {
      return { ok: false, error: "A edição precisa de pelo menos 2 participantes." }
    }

    let confrontos
    try {
      confrontos = semearPlayoffPorPosicao(slotIds)
    } catch (e) {
      console.error("iniciarEdicaoCopa: seeding", e instanceof Error ? e.message : e)
      return { ok: false, error: "Não foi possível iniciar a edição agora. Tente novamente." }
    }

    const idaEVolta = snapshot.ida_e_volta ?? false
    const r = await gerarChaveSemeada(supabase, edicao.tournamentId, confrontos, idaEVolta)
    if (!r.ok) return { ok: false, error: r.error }
  } else {
    // grupos_mata_mata: a geometria vem do snapshot (congelada na montagem). O
    // sorteio dos grupos é semeado pelo id da edição (determinístico/auditável).
    const qtdGrupos = snapshot.qtd_grupos ?? edicao.copa.qtd_grupos ?? 0
    const classificadosPorGrupo =
      snapshot.classificados_por_grupo ?? edicao.copa.classificados_por_grupo ?? 0
    const rng = prngDeSemente(`cup:${parsedId.data}`)
    const r = await gerarFaseGruposSemeada(supabase, edicao.tournamentId, {
      qtdGrupos,
      classificadosPorGrupo,
      idaEVolta: snapshot.ida_e_volta ?? false,
      randInt: (k: number) => Math.floor(rng() * k),
    })
    if (!r.ok) return { ok: false, error: r.error }
  }

  // Promove a edição para 'ativa' (idempotente: filtra status 'montada').
  await supabase
    .from("cup_seasons")
    .update({ status: "ativa" })
    .eq("id", parsedId.data)
    .eq("status", "montada")

  revalidatePath(`/dashboard/copas/edicao/${parsedId.data}`)
  revalidatePath(`/dashboard/copas/${edicao.copa.id}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* encerrarEdicaoCopa — grava cup_entries.posicao_final + status 'encerrada'   */
/* -------------------------------------------------------------------------- */

/**
 * Encerra uma edição ativa. EXIGE a chave 100% concluída ANTES de qualquer escrita
 * (HIGH 2): grupos sem pendências (`faseDeGruposIncompleta`) + nenhuma partida de
 * mata-mata em aberto (grupo IS NULL, status != encerrada, inclusive a final) +
 * classificação com campeão e vice. Só então: encerra o `tournaments` (reusa
 * `encerrarTorneio`, que só seta status); carrega partidas + slots; em grupos, computa
 * `eliminadosGruposOrdenados` (computeStandings por grupo → não-classificados
 * ordenados por colocação agregada + seed); chama `lerClassificacaoFinalCopa` (motor
 * puro) e grava `cup_entries.posicao_final` por slotId; transiciona
 * `cup_seasons.status='encerrada'` + `encerrada_em`. Só o dono.
 */
export async function encerrarEdicaoCopa(cupSeasonId: unknown): Promise<CupResult> {
  const parsedId = cupSeasonIdSchema.safeParse(cupSeasonId)
  if (!parsedId.success) return { ok: false, error: "Edição inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const edicao = await carregarEdicaoDoDono(supabase, parsedId.data, sessao.userId)
  if (!edicao) {
    return { ok: false, error: "Edição não encontrada ou você não é o dono dela." }
  }
  if (edicao.status === "encerrada") {
    return { ok: false, error: "Esta edição já foi encerrada." }
  }
  if (edicao.status !== "ativa" || !edicao.tournamentId) {
    return { ok: false, error: "Inicie e conclua a edição antes de encerrá-la." }
  }

  // GATE de COMPLETUDE da chave (HIGH 2): `encerrarTorneio` só seta status='encerrado'
  // SEM validar partidas pendentes. Encerrar a edição sobre uma chave incompleta
  // gravaria `posicao_final` PARCIAL e transicionaria a edição irreversivelmente,
  // corrompendo a derivação downstream (classificacao_final_copa). Por isso exigimos a
  // chave 100% concluída ANTES de encerrar o torneio e ANTES de gravar/transicionar.
  const erroChaveIncompleta =
    "Conclua todas as partidas da chave (inclusive a final) antes de encerrar a edição."

  if (edicao.copa.formato === "grupos_mata_mata") {
    const gruposPendentes = await faseDeGruposIncompleta(supabase, edicao.tournamentId)
    if (gruposPendentes === null) {
      return { ok: false, error: "Não foi possível validar a fase de grupos. Tente novamente." }
    }
    if (gruposPendentes) {
      return { ok: false, error: erroChaveIncompleta }
    }
  }

  // Mata-mata (em ambos os formatos): nenhuma partida da chave (grupo IS NULL) pode
  // estar em aberto — inclusive a final.
  const { count: chavePendentes, error: chavePendError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", edicao.tournamentId)
    .is("grupo", null)
    .neq("status", "encerrada")
  if (chavePendError) {
    return { ok: false, error: "Não foi possível validar as partidas da chave. Tente novamente." }
  }
  if ((chavePendentes ?? 0) > 0) {
    return { ok: false, error: erroChaveIncompleta }
  }

  // Exige o torneio encerrado (a classificação final só é estável com a chave
  // concluída — já validada acima). Reusa `encerrarTorneio` (idempotente; capacidade
  // dono via RLS) para GARANTIR o encerramento se o dono ainda não o fez.
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("status")
    .eq("id", edicao.tournamentId)
    .maybeSingle()
  if (torneioError || !torneio) {
    return { ok: false, error: "Não foi possível ler o torneio da edição. Tente novamente." }
  }
  if (torneio.status !== "encerrado") {
    // Tenta encerrar o torneio (dono); se falhar, propaga.
    const enc = await encerrarTorneio(edicao.tournamentId)
    if (!enc.ok) {
      return {
        ok: false,
        error: "Encerre o torneio da edição (conclua os jogos) antes de encerrar a edição.",
      }
    }
  }

  // Slots da edição (id + seed + identidade) — via cup_entries (slot_id liga ao slot).
  const { data: entries, error: entriesError } = await supabase
    .from("cup_entries")
    .select("id, slot_id, seed, team_id, rotulo")
    .eq("cup_season_id", parsedId.data)
    .not("slot_id", "is", null)
  if (entriesError) {
    return { ok: false, error: "Não foi possível ler os participantes. Tente novamente." }
  }
  const slots: SlotEdicao[] = (entries ?? [])
    .filter((e) => e.slot_id != null)
    .map((e) => ({
      id: e.slot_id!,
      seed: e.seed ?? Number.MAX_SAFE_INTEGER,
      team_id: e.team_id,
      rotulo: e.rotulo,
    }))
  // Mapa slot_id → entry_id (gravar posicao_final na entry).
  const entryPorSlot = new Map<string, string>()
  for (const e of entries ?? []) {
    if (e.slot_id) entryPorSlot.set(e.slot_id, e.id)
  }

  // Partidas do torneio (shape PartidaJogada + grupo).
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(
      "rodada, posicao, perna, vaga_1, vaga_2, placar_1, placar_2, status, grupo, wo, wo_vencedor, wo_duplo"
    )
    .eq("tournament_id", edicao.tournamentId)
  if (matchesError) {
    return { ok: false, error: "Não foi possível ler as partidas. Tente novamente." }
  }

  const partidasChave: PartidaJogada[] = (matches ?? [])
    .filter((m) => m.grupo == null) // só o mata-mata (grupos têm grupo != null)
    .map((m) => ({
      rodada: m.rodada,
      posicao: m.posicao,
      perna: m.perna,
      participante_1: m.vaga_1,
      participante_2: m.vaga_2,
      placar_1: m.placar_1,
      placar_2: m.placar_2,
      status: m.status,
      woVencedor: m.wo ? m.wo_vencedor : null,
    }))

  // grupos_mata_mata: computa os eliminados da fase de grupos ORDENADOS (melhor
  // primeiro), para ficarem abaixo de todos os da chave. Os classificados subiram
  // à chave (seu destino sai do mata-mata). Eliminado = slot que ficou na fase de
  // grupos e NÃO virou participante do mata-mata.
  let eliminadosGruposOrdenados: string[] = []
  if (edicao.copa.formato === "grupos_mata_mata") {
    const naChave = new Set<string>()
    for (const p of partidasChave) {
      if (p.participante_1) naChave.add(p.participante_1)
      if (p.participante_2) naChave.add(p.participante_2)
    }
    eliminadosGruposOrdenados = computarEliminadosGrupos(matches ?? [], slots, naChave)
  }

  const terceiroLugar = ((edicao.configSnapshot ?? {}) as { terceiro_lugar?: boolean })
    .terceiro_lugar ?? false

  const classificacao = lerClassificacaoFinalCopa(partidasChave, slots, {
    terceiroLugar,
    eliminadosGruposOrdenados,
  })

  // Defesa extra (HIGH 2): a classificação só é válida com campeão (1) E vice (2)
  // definidos — se a final não decidiu, o motor não os produz. Aborta sem gravar nem
  // transicionar (não corrompe a edição com uma classificação parcial).
  const temCampeao = classificacao.some((l) => l.posicao_final === 1)
  const temVice = classificacao.some((l) => l.posicao_final === 2)
  if (!temCampeao || !temVice) {
    return { ok: false, error: erroChaveIncompleta }
  }

  // Grava posicao_final por slotId (sequência de updates; PostgREST não transaciona).
  for (const linha of classificacao) {
    const entryId = entryPorSlot.get(linha.slotId)
    if (!entryId) continue
    const { error } = await supabase
      .from("cup_entries")
      .update({ posicao_final: linha.posicao_final })
      .eq("id", entryId)
      .eq("cup_season_id", parsedId.data)
    if (error) {
      return { ok: false, error: "Não foi possível gravar a classificação. Tente novamente." }
    }
  }

  // Transição final (idempotente: filtra status 'ativa').
  const { error: statusError } = await supabase
    .from("cup_seasons")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("id", parsedId.data)
    .eq("status", "ativa")
  if (statusError) {
    return { ok: false, error: "Não foi possível encerrar a edição agora. Tente novamente." }
  }

  revalidatePath(`/dashboard/copas/edicao/${parsedId.data}`)
  revalidatePath(`/dashboard/copas/${edicao.copa.id}`)
  return { ok: true }
}

/**
 * Computa os ELIMINADOS da fase de grupos ordenados (melhor primeiro): por grupo,
 * `computeStandings` sobre as partidas do grupo; os que NÃO subiram à chave entram
 * na lista ordenados por colocação no grupo; entre grupos, intercala por colocação
 * (1ºs eliminados, depois 2ºs…) e desempata por seed. Cada id é um `slot_id`.
 */
function computarEliminadosGrupos(
  matches: Array<{
    rodada: number | null
    grupo: number | null
    vaga_1: string | null
    vaga_2: string | null
    placar_1: number
    placar_2: number
    status: import("@/lib/supabase/database.types").MatchStatus
    wo: boolean
    wo_vencedor: string | null
    wo_duplo: boolean
  }>,
  slots: SlotEdicao[],
  naChave: Set<string>
): string[] {
  const seedDe = (slotId: string): number =>
    slots.find((s) => s.id === slotId)?.seed ?? Number.MAX_SAFE_INTEGER

  // Agrupa partidas por grupo.
  const grupos = new Map<number, PartidaClassificavel[]>()
  for (const m of matches) {
    if (m.grupo == null) continue
    const lista = grupos.get(m.grupo) ?? []
    lista.push({
      participante_1: m.vaga_1,
      participante_2: m.vaga_2,
      placar_1: m.placar_1,
      placar_2: m.placar_2,
      status: m.status,
      woVencedor: m.wo ? m.wo_vencedor : null,
      woDuplo: m.wo === true && m.wo_duplo === true,
    })
    grupos.set(m.grupo, lista)
  }

  // Por grupo: classificação; os eliminados são os que não estão na chave, na ordem
  // da classificação. Guardamos (colocaçãoNoGrupo, slotId) para intercalar depois.
  const eliminadosPorColocacao: Array<{ colocacao: number; slotId: string }> = []
  for (const partidas of grupos.values()) {
    const linhas = computeStandings(REGRAS_PONTOS, partidas)
    let colocacaoEliminado = 0
    for (const l of linhas) {
      if (naChave.has(l.participanteId)) continue // subiu à chave
      colocacaoEliminado += 1
      eliminadosPorColocacao.push({ colocacao: colocacaoEliminado, slotId: l.participanteId })
    }
  }

  // Intercala por colocação (todos os 1ºs-eliminados, depois 2ºs…) e desempata por
  // seed (melhor seed = melhor posição final entre os eliminados).
  eliminadosPorColocacao.sort((a, b) => {
    if (a.colocacao !== b.colocacao) return a.colocacao - b.colocacao
    return seedDe(a.slotId) - seedDe(b.slotId)
  })
  return eliminadosPorColocacao.map((e) => e.slotId)
}

/* -------------------------------------------------------------------------- */
/* arquivarCopa / apagarCopa — ciclo de vida                                   */
/* -------------------------------------------------------------------------- */

/** Arquiva a copa (status='arquivada'): some das listagens públicas; histórico fica. */
export async function arquivarCopa(cupId: unknown): Promise<CupResult> {
  const parsedId = cupIdSchema.safeParse(cupId)
  if (!parsedId.success) return { ok: false, error: "Copa inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const { data: atualizados, error } = await supabase
    .from("cup_competitions")
    .update({ status: "arquivada" })
    .eq("id", parsedId.data)
    .eq("created_by", sessao.userId)
    .neq("status", "arquivada")
    .select("id")
  if (error) {
    return { ok: false, error: "Não foi possível arquivar a copa agora. Tente novamente." }
  }
  if (!atualizados || atualizados.length === 0) {
    return { ok: false, error: "Copa não encontrada, já arquivada ou você não é o dono dela." }
  }

  revalidatePath("/dashboard/copas")
  revalidatePath(`/dashboard/copas/${parsedId.data}`)
  return { ok: true }
}

/**
 * Apaga a copa (DELETE). O trigger `cup_competitions_block_delete` recusa se houver
 * edição materializada (COPA_COM_EDICAO_MATERIALIZADA) — nesse caso oriente a
 * arquivar. As regras/edições rascunho caem em cascata. Só o dono.
 */
export async function apagarCopa(cupId: unknown): Promise<CupResult> {
  const parsedId = cupIdSchema.safeParse(cupId)
  if (!parsedId.success) return { ok: false, error: "Copa inválida." }

  const supabase = await createClient()
  const sessao = await exigirSessao(supabase)
  if (!sessao.ok) return { ok: false, error: sessao.error }

  const { error, count } = await supabase
    .from("cup_competitions")
    .delete({ count: "exact" })
    .eq("id", parsedId.data)
    .eq("created_by", sessao.userId)
  if (error) {
    // Trigger anti-apagar dispara aqui (COPA_COM_EDICAO_MATERIALIZADA).
    return { ok: false, error: mensagemDaCopa(error) }
  }
  if ((count ?? 0) === 0) {
    return { ok: false, error: "Copa não encontrada ou você não é o dono dela." }
  }

  revalidatePath("/dashboard/copas")
  return { ok: true }
}
