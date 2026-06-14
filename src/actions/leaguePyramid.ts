"use server"

import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { iniciarTorneio } from "@/actions/tournaments"
import { gerarChaveSemeada } from "@/features/knockout/data/gerarChaveSemeada"
import {
  gerarBarragemPares,
  resultadoBarragemPares,
  resultadoDaChave,
  semearPlayoffPorPosicao,
  type ConfrontoChave,
  type PartidaJogada,
} from "@/features/knockout/gerarChaveMataMata"
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"
import {
  createCompetitionSchema,
  DIVISAO_MAX_TAMANHO,
  DIVISAO_MIN_TAMANHO,
  movimentoEfetivo,
  type CreateCompetitionInput,
} from "@/schema/leaguePyramidSchema"
// Motor PURO de fluxo (helpers síncronos + tipos) vive fora deste módulo
// `"use server"` — aqui toda export precisa ser async function (ver flowEngine).
import {
  calcularPlanoFluxo,
  combinarFronteiraBarragem,
  combinarFronteiraPlayoff,
  validarFechamentoTamanho,
  zonaBarragemPorPosicao,
  zonaPlayoffPorPosicao,
  type AjusteFluxo,
  type DivisaoFluxo,
  type FronteiraFluxo,
  type ItemPlanoFluxo,
  type LinhaClassificada,
  type LinhaFluxo,
  type PlanoFluxoTemporada,
} from "@/features/league/flowEngine"
import {
  carregarPosicoesDeCorte,
  type LinhaReal,
} from "@/features/league/promedios"

/* -------------------------------------------------------------------------- */
/* Tipos de retorno (padrão do projeto)                                       */
/* -------------------------------------------------------------------------- */

export type LeaguePyramidFormState = {
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Id da pirâmide/temporada criadas (sucesso) — a UI navega a partir daqui. */
  competitionId?: string
  seasonId?: string
}

export type LeaguePyramidResult = { ok: true } | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* createCompetition — cria a pirâmide + temporada 1 (rascunho) + competidores */
/* -------------------------------------------------------------------------- */

/** Discrimina competidor por nome (tem `rotulo`) vs. clube (tem `teamId`). */
function temRotulo(
  c: CreateCompetitionInput["divisoes"][number]["competidores"][number]
): c is { rotulo: string } {
  return "rotulo" in c
}

/**
 * Cria uma PIRÂMIDE de ligas com o usuário da sessão como dono. NÃO cria
 * `tournaments` aqui (isso é `montarTemporada`/RPC): apenas a config-mãe + a
 * temporada 1 em rascunho + as divisões/fronteiras/competidores e as entries
 * (sem `slot_id`, que a RPC preenche). `created_by` é do SERVIDOR; a RLS é a
 * 2ª barreira.
 *
 * Sem transação via PostgREST — sequência de INSERTs na ordem de dependência
 * (competition → season → divisions → boundaries → competitors → entries) com
 * early-return em erro. A primeira falha aborta e reporta; nada de torneios é
 * criado nesta etapa (a montagem é idempotente e roda depois).
 */
export async function createCompetition(
  input: CreateCompetitionInput
): Promise<LeaguePyramidFormState> {
  const parsed = createCompetitionSchema.safeParse(input)
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
    return { error: "Sessão expirada. Entre novamente para criar uma liga." }
  }

  const erroGenerico =
    "Não foi possível criar a liga agora. Nada foi salvo — tente novamente."

  const dados = parsed.data

  // (1) Pirâmide (config-mãe). created_by no servidor.
  const { data: competition, error: compError } = await supabase
    .from("league_competitions")
    .insert({
      nome: dados.nome,
      is_public: dados.isPublic,
      created_by: user.id,
      // Desempate padrão da pirâmide = o da primeira divisão (atalho de UI).
      desempate_padrao: dados.divisoes[0]?.desempate ?? "cbf",
    })
    .select("id")
    .single()
  if (compError || !competition) {
    console.error("createCompetition: pirâmide", compError?.code ?? compError?.message)
    return { error: erroGenerico }
  }
  const competitionId = competition.id

  // A partir daqui, qualquer falha tenta compensar apagando a pirâmide (cascata
  // derruba tudo que pendurou). Best-effort, não-transacional.
  const compensar = async () => {
    const { error } = await supabase
      .from("league_competitions")
      .delete()
      .eq("id", competitionId)
      .eq("created_by", user.id)
    if (error) {
      console.error("createCompetition: compensação falhou", error.code ?? error.message)
    }
  }

  // (2) Temporada 1 (rascunho).
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .insert({
      competition_id: competitionId,
      numero: 1,
      status: "rascunho",
    })
    .select("id")
    .single()
  if (seasonError || !season) {
    console.error("createCompetition: temporada", seasonError?.code ?? seasonError?.message)
    await compensar()
    return { error: erroGenerico }
  }
  const seasonId = season.id

  // (3) Divisões da temporada (uma por nível). Guarda o id por nível para ligar
  // os competidores às entries.
  const { data: divisoesInseridas, error: divError } = await supabase
    .from("league_division_seasons")
    .insert(
      dados.divisoes.map((div) => ({
        season_id: seasonId,
        nivel: div.nivel,
        nome: div.nome,
        por_nome: div.porNome,
        desempate: div.desempate,
        ranking_base: div.rankingBase,
        tamanho: div.tamanho,
      }))
    )
    .select("id, nivel")
  if (divError || !divisoesInseridas || divisoesInseridas.length === 0) {
    console.error("createCompetition: divisões", divError?.code ?? divError?.message)
    await compensar()
    return { error: erroGenerico }
  }
  const divisionSeasonIdPorNivel = new Map<number, string>(
    divisoesInseridas.map((d) => [d.nivel, d.id])
  )

  // (4) Fronteiras (pode ser vazio em pirâmide de 1 divisão — N=1).
  if (dados.fronteiras.length > 0) {
    const { error: boundError } = await supabase.from("league_boundaries").insert(
      dados.fronteiras.map((f) => ({
        season_id: seasonId,
        nivel_superior: f.nivelSuperior,
        vagas_acesso: f.vagasAcesso,
        vagas_rebaixamento: f.vagasRebaixamento,
        modo: f.modo,
        // Fase 2: estilo/leg/tamanho da chave (null em 'direto').
        playoff_estilo: f.playoffEstilo ?? null,
        playoff_ida_e_volta: f.playoffIdaEVolta,
        playoff_vagas: f.playoffVagas ?? null,
      }))
    )
    if (boundError) {
      console.error("createCompetition: fronteiras", boundError.code ?? boundError.message)
      await compensar()
      return { error: erroGenerico }
    }
  }

  // (5) Competidores (um por clube/nome) — colhe os ids para as entries.
  //     Achata na ordem (divisão, competidor) para casar com as entries abaixo.
  type CompetidorLinha = {
    competition_id: string
    team_id: string | null
    rotulo: string | null
    holder_user_id: string | null
    /** Nível da divisão a que pertence (para a entry). */
    _nivel: number
  }
  const linhasCompetidores: CompetidorLinha[] = []
  for (const div of dados.divisoes) {
    for (const c of div.competidores) {
      // Fase 1: a vaga é sempre gerida pelo dono (holder_user_id = null).
      // Delegar a técnico de terceiro exige aceite (fluxo futuro) — não aqui.
      if (temRotulo(c)) {
        linhasCompetidores.push({
          competition_id: competitionId,
          team_id: null,
          rotulo: c.rotulo,
          holder_user_id: null,
          _nivel: div.nivel,
        })
      } else {
        linhasCompetidores.push({
          competition_id: competitionId,
          team_id: c.teamId,
          rotulo: null,
          holder_user_id: null,
          _nivel: div.nivel,
        })
      }
    }
  }

  const { data: competidores, error: compsError } = await supabase
    .from("league_competitors")
    .insert(
      linhasCompetidores.map(({ _nivel: _ignored, ...row }) => {
        void _ignored
        return row
      })
    )
    .select("id")
  if (compsError || !competidores || competidores.length !== linhasCompetidores.length) {
    console.error("createCompetition: competidores", compsError?.code ?? compsError?.message)
    await compensar()
    return { error: erroGenerico }
  }

  // (6) Entries (competidor × divisão-temporada), SEM slot_id (a RPC preenche).
  //     A ordem do insert de competidores casa 1:1 com `linhasCompetidores`.
  const entries = competidores.map((comp, i) => {
    const nivel = linhasCompetidores[i]._nivel
    const divisionSeasonId = divisionSeasonIdPorNivel.get(nivel)
    return {
      division_season_id: divisionSeasonId!,
      competitor_id: comp.id,
    }
  })
  // Sanidade: toda divisão referida existe (refine do schema já garante níveis
  // contínuos, mas a montagem cross-tabela merece a checagem explícita).
  if (entries.some((e) => !e.division_season_id)) {
    console.error("createCompetition: divisão ausente para competidor")
    await compensar()
    return { error: erroGenerico }
  }

  const { error: entriesError } = await supabase
    .from("league_division_entries")
    .insert(entries)
  if (entriesError) {
    console.error("createCompetition: entries", entriesError.code ?? entriesError.message)
    await compensar()
    return { error: erroGenerico }
  }

  revalidatePath("/dashboard/ligas")
  return { competitionId, seasonId }
}

/* -------------------------------------------------------------------------- */
/* montarTemporada — action thin sobre a RPC montar_temporada (SECURITY DEFINER)*/
/* -------------------------------------------------------------------------- */

const seasonIdSchema = z.uuid({ error: "Temporada inválida." })
const divisionSeasonIdSchema = z.uuid({ error: "Divisão inválida." })

/**
 * Schema dos ajustes do dono (override do empate). `confirmarFluxoTemporada` é
 * uma Server Action (endpoint chamável direto) — os ajustes NÃO podem entrar
 * crus: além deste parse, a action valida que cada ajuste recai sobre um
 * competidor SORTEADO e PRESERVA quantos sobem/caem por divisão (só troca quem
 * ocupa as vagas — conservação por fronteira). `nivelDestino` é positivo.
 */
const ajustesFluxoSchema = z
  .array(
    z.object({
      competitorId: z.uuid(),
      destino: z.enum(["sobe", "cai", "permanece"]),
      nivelDestino: z.number().int().min(1),
    })
  )
  .max(400, { error: "Ajustes em excesso." })

/**
 * Mapeia as exceções da RPC `montar_temporada` (mensagens-código curtas) para
 * texto pt-BR. Erros fora da lista viram mensagem genérica — sem vazar detalhe.
 */
function mensagemDaMontagem(error: { message?: string; code?: string }): string {
  const m = error.message ?? ""
  if (m.includes("AUTH_REQUIRED")) {
    return "Você precisa estar autenticado para montar a temporada."
  }
  if (m.includes("SEASON_INVALIDA")) {
    return "Temporada não encontrada."
  }
  if (m.includes("NAO_DONO")) {
    return "Você não é o dono desta liga."
  }
  if (m.includes("DIVISAO_SEM_COMPETIDORES_SUFICIENTES")) {
    return "Uma das divisões tem menos de 2 competidores. Ajuste a liga antes de montar."
  }
  if (m.includes("COMPETIDOR_INCOMPATIVEL_COM_DIVISAO")) {
    return "Há competidor no modo errado (clube numa divisão por nome ou vice-versa)."
  }
  if (m.includes("COMPETIDOR_DE_OUTRA_PIRAMIDE")) {
    return "Há competidor de outra liga associado a esta temporada."
  }
  // Erros específicos da RPC montar_playoff (Fase 2).
  if (m.includes("BOUNDARY_INVALIDA")) {
    return "Fronteira de playoff não encontrada."
  }
  if (m.includes("FRONTEIRA_SEM_PLAYOFF")) {
    return "Esta fronteira não tem playoff configurado."
  }
  if (m.includes("DIVISAO_FONTE_INVALIDA")) {
    return "A divisão de origem do playoff não foi encontrada."
  }
  if (m.includes("COMPETIDOR_FORA_DA_ZONA")) {
    return "Há competidor fora da zona do playoff."
  }
  if (m.includes("PLAYOFF_POR_NOME_INCOERENTE")) {
    return "A divisão do playoff mistura clube e nome — incoerente."
  }
  // Erros específicos da RPC montar_barragem (Fase 3).
  if (m.includes("FRONTEIRA_NAO_BARRAGEM")) {
    return "Esta fronteira não é uma barragem cruzada."
  }
  if (m.includes("BARRAGEM_POR_NOME_INCOERENTE")) {
    return "A barragem mistura divisões por clube e por nome — incoerente."
  }
  if (m.includes("ZONA_VAZIA")) {
    return "A zona do playoff ficou sem competidores suficientes."
  }
  return "Não foi possível montar a temporada agora. Tente novamente."
}

/**
 * Monta a temporada: cria os `tournaments` de cada divisão (rascunho), insere os
 * `tournament_slots` preenchidos e liga as entries — TUDO dentro da RPC
 * `montar_temporada` (SECURITY DEFINER), o único caminho que pré-preenche
 * `user_id` (técnico que acompanha o competidor) após validar posse. Idempotente
 * pela sentinela `league_division_seasons.tournament_id` (re-rodar completa só o
 * que faltou). A action é fina: chama a RPC e traduz o erro.
 */
export async function montarTemporada(input: unknown): Promise<LeaguePyramidResult> {
  const parsed = seasonIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Temporada inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  try {
    const { error } = await supabase.rpc("montar_temporada", {
      p_season_id: parsed.data,
    })
    if (error) {
      return { ok: false, error: mensagemDaMontagem(error) }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { action: "montarTemporada" } })
    return { ok: false, error: "Não foi possível montar a temporada agora. Tente novamente." }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${parsed.data}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* iniciarDivisao — reúso de iniciarTorneio + transição season → 'ativa'        */
/* -------------------------------------------------------------------------- */

/**
 * Inicia UMA divisão de uma temporada: carrega o `tournament_id` da divisão e
 * delega a `iniciarTorneio` (reúso TOTAL do motor de liga). Quando TODAS as
 * divisões da temporada já têm o torneio fora de rascunho, transiciona a
 * temporada para 'ativa'. Posse conferida por FILTRO transitivo (divisão →
 * season → competition.created_by) + RLS como 2ª barreira.
 */
export async function iniciarDivisao(input: unknown): Promise<LeaguePyramidResult> {
  const parsed = divisionSeasonIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Divisão inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const erroPropriedade = "Divisão não encontrada ou você não é o dono da liga."

  // Carrega a divisão + season + posse por FILTRO transitivo (inner joins).
  const { data: divisao, error: divError } = await supabase
    .from("league_division_seasons")
    .select(
      "id, tournament_id, season_id, league_seasons!inner(id, status, league_competitions!inner(created_by))"
    )
    .eq("id", parsed.data)
    .eq("league_seasons.league_competitions.created_by", user.id)
    .maybeSingle()
  if (divError) {
    return { ok: false, error: "Não foi possível iniciar a divisão agora. Tente novamente." }
  }
  if (!divisao || !divisao.tournament_id) {
    // Divisão inexistente, de liga alheia, ou ainda não montada (sem torneio).
    return { ok: false, error: erroPropriedade }
  }

  // Reúso total: iniciarTorneio valida dono (o dono da pirâmide É o created_by
  // do torneio da divisão), gera a tabela e promove o torneio a 'ativo'.
  const r = await iniciarTorneio(divisao.tournament_id)
  if (!r.ok) {
    return r
  }

  // Se TODAS as divisões da temporada já saíram de rascunho, a temporada vira
  // 'ativa'. Conta as divisões e as que ainda estão em rascunho.
  const seasonId = divisao.season_id
  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("tournament_id, tournaments!inner(status)")
    .eq("season_id", seasonId)
  if (!divsError && divisoes) {
    const todasIniciadas =
      divisoes.length > 0 &&
      divisoes.every((d) => {
        const t = d.tournaments as unknown as { status: string } | null
        return d.tournament_id !== null && t !== null && t.status !== "rascunho"
      })
    if (todasIniciadas) {
      // Transição idempotente (filtra status 'rascunho' → só dispara uma vez).
      await supabase
        .from("league_seasons")
        .update({ status: "ativa" })
        .eq("id", seasonId)
        .eq("status", "rascunho")
    }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${seasonId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* montarPlayoffs — cria/joga as chaves de playoff das fronteiras (Fase 2)       */
/* -------------------------------------------------------------------------- */

type ChaveResultadoMapeado =
  | { ok: true; sobem: Set<string>; caem: Set<string>; decidida: true }
  | { ok: false; error: string }

/**
 * Lê o resultado de uma chave de playoff já mapeado a competitorIds. Helper
 * SERVER puro de IO (não é Server Action — `supabase` como arg). Lê as partidas e
 * o mapa slot→competidor da chave, roda `resultadoDaChave`, e exige `decidida`.
 */
async function lerResultadoChave(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playoffTournamentId: string,
  opts: {
    modo: "playoff_acesso" | "playout"
    estilo: "vagas" | "extra"
    vagas: number
    playoffVagas: number
  }
): Promise<ChaveResultadoMapeado> {
  const erro = "Não foi possível ler a chave do playoff. Tente novamente."
  const { data: slots, error: slotsError } = await supabase
    .from("tournament_slots")
    .select("id, competitor_id")
    .eq("tournament_id", playoffTournamentId)
  if (slotsError || !slots) {
    return { ok: false, error: erro }
  }
  const compPorSlot = new Map<string, string>()
  for (const s of slots) {
    if (s.competitor_id) compPorSlot.set(s.id, s.competitor_id)
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(
      "rodada, posicao, perna, vaga_1, vaga_2, placar_1, placar_2, status, wo, wo_vencedor"
    )
    .eq("tournament_id", playoffTournamentId)
    .not("rodada", "is", null)
  if (matchesError) {
    return { ok: false, error: erro }
  }
  const partidas: PartidaJogada[] = (matches ?? []).map((m) => ({
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

  const r = resultadoDaChave(partidas, opts)
  if (!r.decidida) {
    return {
      ok: false,
      error: "Há playoff pendente: termine as chaves antes de calcular o fluxo.",
    }
  }
  const mapear = (ids: Set<string>) => {
    const out = new Set<string>()
    for (const slotId of ids) {
      const c = compPorSlot.get(slotId)
      if (c) out.add(c)
    }
    return out
  }
  return { ok: true, sobem: mapear(r.sobem), caem: mapear(r.caem), decidida: true }
}

/**
 * Lê o desfecho de uma chave de BARRAGEM (Fase 3) — em competitorIds. O `chave`
 * reusa `resultadoDaChave` (campeão = único `.sobem`); o `pares` usa
 * `resultadoBarragemPares` (vencedor/perdedor por par). PURO a partir das
 * partidas; a action cruza com a zona (quem é de d vs d+1) em
 * `combinarFronteiraBarragem`.
 */
type BarragemLeitura =
  | {
      ok: true
      campeao?: string
      resultadoPares?: { vencedor: string; perdedor: string }[]
    }
  | { ok: false; error: string }

async function lerResultadoBarragem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playoffTournamentId: string,
  opts: { estilo: "pares" | "chave"; playoffVagas: number }
): Promise<BarragemLeitura> {
  const erro = "Não foi possível ler a barragem. Tente novamente."
  const pendente =
    "Há barragem pendente: termine as chaves antes de calcular o fluxo."
  const { data: slots, error: slotsError } = await supabase
    .from("tournament_slots")
    .select("id, competitor_id")
    .eq("tournament_id", playoffTournamentId)
  if (slotsError || !slots) {
    return { ok: false, error: erro }
  }
  const compPorSlot = new Map<string, string>()
  for (const s of slots) {
    if (s.competitor_id) compPorSlot.set(s.id, s.competitor_id)
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(
      "rodada, posicao, perna, vaga_1, vaga_2, placar_1, placar_2, status, wo, wo_vencedor"
    )
    .eq("tournament_id", playoffTournamentId)
    .not("rodada", "is", null)
  if (matchesError) {
    return { ok: false, error: erro }
  }
  const partidas: PartidaJogada[] = (matches ?? []).map((m) => ({
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

  if (opts.estilo === "chave") {
    const r = resultadoDaChave(partidas, {
      modo: "playoff_acesso",
      estilo: "extra",
      vagas: 1,
      playoffVagas: opts.playoffVagas,
    })
    if (!r.decidida) {
      return { ok: false, error: pendente }
    }
    const campeaoSlot = [...r.sobem][0]
    const campeao = campeaoSlot ? compPorSlot.get(campeaoSlot) : undefined
    return { ok: true, campeao }
  }

  const r = resultadoBarragemPares(partidas)
  if (!r.decidida) {
    return { ok: false, error: pendente }
  }
  const resultadoPares: { vencedor: string; perdedor: string }[] = []
  for (const { vencedor, perdedor } of r.vencedorPorPar.values()) {
    const v = compPorSlot.get(vencedor)
    const p = perdedor ? compPorSlot.get(perdedor) : undefined
    if (!v || !p) {
      return { ok: false, error: erro }
    }
    resultadoPares.push({ vencedor: v, perdedor: p })
  }
  return { ok: true, resultadoPares }
}

/**
 * Monta as CHAVES de playoff/playout de uma temporada cujas divisões já
 * encerraram. Para cada fronteira não-`direto`: resolve a ZONA pela classificação
 * (best-first), chama a RPC `montar_playoff` (cria o tournaments mata_mata + slots
 * pré-preenchidos) e gera a chave SEMEADA por posição (`gerarChaveSemeada`).
 * Idempotente: a RPC retorna a chave já criada e `gerarChaveSemeada` pula se as
 * partidas já existem (retomada parcial). Posse por FILTRO transitivo + RLS.
 */
export async function montarPlayoffs(input: unknown): Promise<LeaguePyramidResult> {
  const parsed = seasonIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Temporada inválida." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const erroGenerico = "Não foi possível montar os playoffs agora. Tente novamente."
  const erroPropriedade = "Temporada não encontrada ou você não é o dono da liga."

  // Posse + status: a temporada precisa estar 'ativa' (em disputa).
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select("id, status, league_competitions!inner(created_by)")
    .eq("id", parsed.data)
    .eq("league_competitions.created_by", user.id)
    .maybeSingle()
  if (seasonError) {
    return { ok: false, error: erroGenerico }
  }
  if (!season) {
    return { ok: false, error: erroPropriedade }
  }
  if (season.status !== "ativa") {
    return {
      ok: false,
      error:
        season.status === "rascunho"
          ? "Inicie as divisões antes de montar os playoffs."
          : "Esta temporada já saiu da disputa.",
    }
  }

  // Fronteiras de playoff + divisões (nível → tournament_id + status).
  const { data: fronteiras, error: frontError } = await supabase
    .from("league_boundaries")
    .select(
      "nivel_superior, vagas_acesso, vagas_rebaixamento, modo, playoff_estilo, playoff_vagas, playoff_ida_e_volta, playoff_tournament_id, id"
    )
    .eq("season_id", parsed.data)
  if (frontError) {
    return { ok: false, error: erroGenerico }
  }
  const playoffFronteiras = (fronteiras ?? []).filter((f) => f.modo !== "direto")
  if (playoffFronteiras.length === 0) {
    // Nada a montar (temporada só com fronteiras diretas) — no-op idempotente.
    return { ok: true }
  }

  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("id, nivel, tournament_id, ranking_base, tournament:tournaments(status)")
    .eq("season_id", parsed.data)
    .order("nivel")
  if (divsError || !divisoes) {
    return { ok: false, error: erroGenerico }
  }
  // GATE: todas as divisões encerradas (a chave usa a classificação final).
  for (const div of divisoes) {
    const status = (div.tournament as { status: string } | null)?.status
    if (status !== "encerrado") {
      return {
        ok: false,
        error:
          "Encerre todas as divisões antes de montar os playoffs.",
      }
    }
  }
  // Guarda anti-duplo-conta do promedio (ids de todas as divisões da corrente).
  const divisionSeasonIdsAtuais = divisoes.map((d) => d.id)

  // Classificação ordenada pela base de CORTE da divisão (posição em 'posicao';
  // rank de promedio em 'promedios') + slot→competidor, sob demanda. A MESMA
  // fonte (`carregarPosicoesDeCorte`) que `calcularFluxoTemporada` usa — a zona e
  // o seeding da chave seguem o promedio quando a divisão é 'promedios'
  // (montagem ≡ cálculo; evita "consumidor órfão"). Fase 4.
  const classificacaoPorNivel = new Map<number, LinhaClassificada[]>()
  const carregarDivisao = async (
    nivel: number
  ): Promise<LinhaClassificada[] | null> => {
    const cached = classificacaoPorNivel.get(nivel)
    if (cached) return cached
    const div = divisoes.find((d) => d.nivel === nivel)
    if (!div || !div.tournament_id) return null
    const { data: entries, error: entriesError } = await supabase
      .from("league_division_entries")
      .select("competitor_id, slot_id")
      .eq("division_season_id", div.id)
    if (entriesError) return null
    const compPorSlot = new Map<string, string>()
    for (const e of entries ?? []) {
      if (e.slot_id) compPorSlot.set(e.slot_id, e.competitor_id)
    }
    let classificacao
    try {
      classificacao = await getTournamentClassificacao(div.tournament_id)
    } catch {
      return null
    }
    if (!classificacao) return null
    const linhasReais: LinhaReal[] = []
    for (const l of classificacao.linhas) {
      const c = compPorSlot.get(l.participanteId)
      if (!c) return null
      linhasReais.push({
        competitorId: c,
        posicaoReal: l.posicao,
        pontos: l.pontos,
        jogos: l.jogos,
      })
    }
    const corte = await carregarPosicoesDeCorte(
      supabase,
      divisionSeasonIdsAtuais,
      div.ranking_base,
      linhasReais
    )
    if (!corte) return null
    const linhas: LinhaClassificada[] = []
    for (const l of linhasReais) {
      const posicao = corte.posicaoCorte.get(l.competitorId)
      if (posicao === undefined) return null
      linhas.push({ competitorId: l.competitorId, posicao })
    }
    classificacaoPorNivel.set(nivel, linhas)
    return linhas
  }

  for (const f of playoffFronteiras) {
    // BARRAGEM CRUZADA (Fase 3): a chave mistura as duas divisões adjacentes.
    if (f.modo === "barragem_cruzada") {
      const estilo = f.playoff_estilo as "pares" | "chave"
      const playoffVagas = f.playoff_vagas ?? 0
      const superior = await carregarDivisao(f.nivel_superior)
      const inferior = await carregarDivisao(f.nivel_superior + 1)
      if (!superior || !inferior) {
        return { ok: false, error: erroGenerico }
      }
      const zona = zonaBarragemPorPosicao({
        estilo,
        vagasAcesso: f.vagas_acesso,
        vagasRebaixamento: f.vagas_rebaixamento,
        playoffVagas,
        superiorOrdenada: superior,
        inferiorOrdenada: inferior,
      })
      if (!zona || zona.ordenados.length !== playoffVagas) {
        // Zona não cabe (config que escapou do schema) — falha explícita.
        return { ok: false, error: erroGenerico }
      }

      const { data: tournamentId, error: rpcError } = await supabase.rpc(
        "montar_barragem",
        { p_boundary_id: f.id, p_competitor_ids: zona.ordenados }
      )
      if (rpcError || !tournamentId) {
        return { ok: false, error: mensagemDaMontagem(rpcError ?? { message: "" }) }
      }

      const { data: slots, error: slotsError } = await supabase
        .from("tournament_slots")
        .select("id, competitor_id")
        .eq("tournament_id", tournamentId)
      if (slotsError || !slots) {
        return { ok: false, error: erroGenerico }
      }
      const slotPorComp = new Map<string, string>()
      for (const s of slots) {
        if (s.competitor_id) slotPorComp.set(s.competitor_id, s.id)
      }

      let confrontos: ConfrontoChave[]
      let gerador: typeof gerarBarragemPares | undefined
      try {
        if (estilo === "pares") {
          // Pares [inferior, superior] mapeados a slots; o desafiante (inf) é o
          // lado 1 (manda a ida); gerarBarragemPares inverte na volta.
          confrontos = (zona.pares ?? []).map(([inf, sup], i) => {
            const s1 = slotPorComp.get(inf)
            const s2 = slotPorComp.get(sup)
            if (!s1 || !s2) throw new Error("slot ausente na barragem")
            return { posicao: i + 1, participante_1: s1, participante_2: s2 }
          })
          gerador = gerarBarragemPares
        } else {
          const ordenadosSlots = zona.ordenados
            .map((c) => slotPorComp.get(c))
            .filter((s): s is string => s !== undefined)
          if (ordenadosSlots.length !== zona.ordenados.length) {
            throw new Error("slot ausente na barragem")
          }
          confrontos = semearPlayoffPorPosicao(ordenadosSlots)
        }
      } catch (e) {
        console.error(
          "montarPlayoffs: barragem seeding",
          e instanceof Error ? e.message : e
        )
        return { ok: false, error: erroGenerico }
      }

      const r = await gerarChaveSemeada(
        supabase,
        tournamentId,
        confrontos,
        f.playoff_ida_e_volta,
        gerador
      )
      if (!r.ok) {
        return { ok: false, error: r.error }
      }
      continue
    }

    const estilo = f.playoff_estilo as "vagas" | "extra"
    const modo = f.modo as "playoff_acesso" | "playout"
    const playoffVagas = f.playoff_vagas ?? 0
    const fonteNivel = modo === "playout" ? f.nivel_superior : f.nivel_superior + 1
    const fonte = await carregarDivisao(fonteNivel)
    if (!fonte) {
      return { ok: false, error: erroGenerico }
    }

    const competitorIds = zonaPlayoffPorPosicao({
      modo,
      estilo,
      vagasAcesso: f.vagas_acesso,
      vagasRebaixamento: f.vagas_rebaixamento,
      playoffVagas,
      ordenada: fonte,
    })
    if (competitorIds.length !== playoffVagas) {
      // A zona não cabe (config inválida que escapou do schema) — falha explícita.
      return { ok: false, error: erroGenerico }
    }

    // RPC cria (ou retorna) o tournaments da chave + slots na ORDEM recebida.
    const { data: tournamentId, error: rpcError } = await supabase.rpc(
      "montar_playoff",
      { p_boundary_id: f.id, p_competitor_ids: competitorIds }
    )
    if (rpcError || !tournamentId) {
      return { ok: false, error: mensagemDaMontagem(rpcError ?? { message: "" }) }
    }

    // Mapa competidor → slot da chave (para semear na ORDEM de classificação).
    const { data: slots, error: slotsError } = await supabase
      .from("tournament_slots")
      .select("id, competitor_id")
      .eq("tournament_id", tournamentId)
    if (slotsError || !slots) {
      return { ok: false, error: erroGenerico }
    }
    const slotPorComp = new Map<string, string>()
    for (const s of slots) {
      if (s.competitor_id) slotPorComp.set(s.competitor_id, s.id)
    }
    const slotIdsOrdenados = competitorIds
      .map((c) => slotPorComp.get(c))
      .filter((s): s is string => s !== undefined)
    if (slotIdsOrdenados.length !== competitorIds.length) {
      return { ok: false, error: erroGenerico }
    }

    let confrontos
    try {
      confrontos = semearPlayoffPorPosicao(slotIdsOrdenados)
    } catch (e) {
      console.error("montarPlayoffs: seeding", e instanceof Error ? e.message : e)
      return { ok: false, error: erroGenerico }
    }

    const r = await gerarChaveSemeada(
      supabase,
      tournamentId,
      confrontos,
      f.playoff_ida_e_volta
    )
    if (!r.ok) {
      return { ok: false, error: r.error }
    }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${parsed.data}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* calcularFluxoTemporada — READ-ONLY: deriva o PLANO de sobe/cai               */
/* -------------------------------------------------------------------------- */

export type CalcularFluxoResult =
  | { ok: true; plano: PlanoFluxoTemporada }
  | { ok: false; error: string }

/**
 * Calcula (sem escrever) o PLANO de fluxo de uma temporada: lê a classificação
 * de cada divisão via `getTournamentClassificacao`, mapeia slot → competidor e
 * aplica as fronteiras `direto` (N últimos caem / N primeiros sobem). O corte é
 * decidido pela `posicao` dentro de cada divisão; o empate EXATO na linha de
 * corte é resolvido por sorteio DETERMINÍSTICO semeado pelo id da temporada —
 * estável e reproduzível (calcular e confirmar produzem o MESMO plano em todo
 * retry; o id da temporada É a semente auditável). Retorna o plano para a tela
 * de fluxo (2 cliques: calcular → confirmar). Posse por FILTRO transitivo + RLS.
 *
 * EXIGE que TODAS as divisões estejam ENCERRADAS — 'ativa' significa apenas que
 * as divisões foram iniciadas, não concluídas; congelar a classificação parcial
 * decidiria o sobe/cai com jogos faltando (irreversível).
 */
export async function calcularFluxoTemporada(input: unknown): Promise<CalcularFluxoResult> {
  const parsed = seasonIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Temporada inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const erroGenerico = "Não foi possível calcular o fluxo agora. Tente novamente."
  const erroPropriedade = "Temporada não encontrada ou você não é o dono da liga."

  // Posse + carrega divisões (com tournament_id) e fronteiras por FILTRO.
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select("id, status, league_competitions!inner(created_by)")
    .eq("id", parsed.data)
    .eq("league_competitions.created_by", user.id)
    .maybeSingle()
  if (seasonError) {
    return { ok: false, error: erroGenerico }
  }
  if (!season) {
    return { ok: false, error: erroPropriedade }
  }

  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("id, nivel, tournament_id, ranking_base, tournament:tournaments(status)")
    .eq("season_id", parsed.data)
    .order("nivel")
  if (divsError || !divisoes || divisoes.length === 0) {
    return { ok: false, error: erroGenerico }
  }
  // Ids de TODAS as divisões da temporada atual — guarda anti-duplo-conta do
  // promedio (exclui as entries da corrente da soma histórica de vida toda).
  const divisionSeasonIdsAtuais = divisoes.map((d) => d.id)
  // Posição REAL da tabela por competidor (de TODAS as divisões): base do remap
  // de `posicaoFinal` (o motor recebe o rank de corte como `posicao`, mas o
  // histórico esportivo persiste a posição real). Fase 4.
  const posicaoRealPorCompetidor = new Map<string, number>()

  // SELECT de 3 estados (Fase 2): modo + colunas de playoff. Sem isto o ramo
  // não-direto trataria a fronteira como direto (corte por posição, ignorando a
  // chave) — regressão silenciosa.
  const { data: fronteiras, error: frontError } = await supabase
    .from("league_boundaries")
    .select(
      "nivel_superior, vagas_acesso, vagas_rebaixamento, modo, playoff_estilo, playoff_vagas, playoff_tournament_id"
    )
    .eq("season_id", parsed.data)
  if (frontError) {
    return { ok: false, error: erroGenerico }
  }

  // Para cada divisão: lê a classificação e mapeia slot_id → competitor_id pela
  // entry. O motor (getTournamentClassificacao) chaveia as linhas por slot id.
  const divisoesFluxo: DivisaoFluxo[] = []
  for (const div of divisoes) {
    if (!div.tournament_id) {
      return { ok: false, error: "Há divisão ainda não montada. Monte a temporada antes." }
    }

    // GATE: todas as divisões precisam estar ENCERRADAS. O embed `tournament` é
    // to-one (FK division.tournament_id); 'ativo'/'rascunho' = jogos pendentes.
    const statusTorneio = (div.tournament as { status: string } | null)?.status
    if (statusTorneio !== "encerrado") {
      return {
        ok: false,
        error:
          "Há divisão ainda em andamento. Encerre todas as divisões antes de calcular o fluxo.",
      }
    }

    // slot_id → competitor_id (via entries da divisão).
    const { data: entries, error: entriesError } = await supabase
      .from("league_division_entries")
      .select("competitor_id, slot_id")
      .eq("division_season_id", div.id)
    if (entriesError) {
      return { ok: false, error: erroGenerico }
    }
    const competitorPorSlot = new Map<string, string>()
    for (const e of entries ?? []) {
      if (e.slot_id) competitorPorSlot.set(e.slot_id, e.competitor_id)
    }

    let classificacao
    try {
      classificacao = await getTournamentClassificacao(div.tournament_id)
    } catch (e) {
      console.error("calcularFluxoTemporada: classificação", e instanceof Error ? e.message : e)
      return { ok: false, error: erroGenerico }
    }
    if (!classificacao) {
      return { ok: false, error: erroGenerico }
    }

    // Linhas REAIS (posição da tabela do ano). Alimentam o remap de posicaoFinal,
    // o promedio (campanha ao vivo) e — quando ranking_base='posicao' — o corte.
    const linhasReais: LinhaReal[] = []
    for (const linha of classificacao.linhas) {
      // `participanteId` no competitivo É o slot id.
      const competitorId = competitorPorSlot.get(linha.participanteId)
      if (!competitorId) {
        // Slot sem competidor mapeado: divisão fora do trilho da pirâmide.
        return { ok: false, error: erroGenerico }
      }
      linhasReais.push({
        competitorId,
        posicaoReal: linha.posicao,
        pontos: linha.pontos,
        jogos: linha.jogos,
      })
      posicaoRealPorCompetidor.set(competitorId, linha.posicao)
    }

    // Rank de CORTE da divisão (posição real OU rank de promedio, conforme
    // `ranking_base`). MESMA fonte que `montarPlayoffs` e `getDivisionStandings`
    // (montagem ≡ cálculo). O motor recebe esse rank como `posicao`; `pontos`/
    // `jogos` seguem REAIS (persistência + promedio futuro).
    const corte = await carregarPosicoesDeCorte(
      supabase,
      divisionSeasonIdsAtuais,
      div.ranking_base,
      linhasReais
    )
    if (!corte) {
      return { ok: false, error: erroGenerico }
    }
    const linhas: LinhaFluxo[] = []
    for (const l of linhasReais) {
      const posicao = corte.posicaoCorte.get(l.competitorId)
      if (posicao === undefined) {
        return { ok: false, error: erroGenerico }
      }
      linhas.push({ competitorId: l.competitorId, posicao, pontos: l.pontos, jogos: l.jogos })
    }
    divisoesFluxo.push({ nivel: div.nivel, linhas })
  }

  // Resolve cada fronteira: 'direto' segue o corte por posição (Fase 1); as de
  // playoff/playout LEEM a chave (resultadoDaChave) e combinam com os cortes
  // diretos (combinarFronteiraPlayoff). FONTE ÚNICA de "chave decidida".
  const porNivel = new Map<number, LinhaClassificada[]>()
  for (const d of divisoesFluxo) {
    porNivel.set(
      d.nivel,
      d.linhas.map((l) => ({ competitorId: l.competitorId, posicao: l.posicao }))
    )
  }

  const fronteirasFluxo: FronteiraFluxo[] = []
  for (const f of fronteiras ?? []) {
    const base: FronteiraFluxo = {
      nivelSuperior: f.nivel_superior,
      vagasAcesso: f.vagas_acesso,
      vagasRebaixamento: f.vagas_rebaixamento,
    }
    if (f.modo === "direto") {
      fronteirasFluxo.push(base)
      continue
    }

    // Fronteira não-direto: precisa da chave montada e DECIDIDA.
    if (!f.playoff_tournament_id) {
      return {
        ok: false,
        error: "Há playoff pendente: monte os playoffs antes de calcular o fluxo.",
      }
    }

    // BARRAGEM CRUZADA (Fase 3): combina o resultado da chave mista com os
    // cortes diretos, cruzando as duas divisões.
    if (f.modo === "barragem_cruzada") {
      const estiloB = f.playoff_estilo as "pares" | "chave"
      const playoffVagasB = f.playoff_vagas ?? 0
      const sup = porNivel.get(f.nivel_superior) ?? []
      const inf = porNivel.get(f.nivel_superior + 1) ?? []
      const zona = zonaBarragemPorPosicao({
        estilo: estiloB,
        vagasAcesso: f.vagas_acesso,
        vagasRebaixamento: f.vagas_rebaixamento,
        playoffVagas: playoffVagasB,
        superiorOrdenada: sup,
        inferiorOrdenada: inf,
      })
      if (!zona) {
        return { ok: false, error: erroGenerico }
      }
      const leituraB = await lerResultadoBarragem(supabase, f.playoff_tournament_id, {
        estilo: estiloB,
        playoffVagas: playoffVagasB,
      })
      if (!leituraB.ok) {
        return { ok: false, error: leituraB.error }
      }
      const playoffB = combinarFronteiraBarragem({
        estilo: estiloB,
        vagasAcesso: f.vagas_acesso,
        vagasRebaixamento: f.vagas_rebaixamento,
        superiorOrdenada: sup,
        inferiorOrdenada: inf,
        deSuperior: zona.deSuperior,
        deInferior: zona.deInferior,
        resultadoPares: leituraB.resultadoPares,
        campeao: leituraB.campeao,
      })
      // Sanidade: a barragem é AUTO-BALANCEADA (|sobePorChave|==|caePorChave|) e
      // a parte direta é simétrica (A==R) — logo sobem.size==caem.size.
      if (
        playoffB.sobemPorChave.size !== playoffB.caemPorChave.size ||
        playoffB.sobem.size !== playoffB.caem.size
      ) {
        console.error(
          "calcularFluxoTemporada: divergência barragem",
          `n${f.nivel_superior} sobe ${playoffB.sobem.size} cai ${playoffB.caem.size}`
        )
        return { ok: false, error: erroGenerico }
      }
      fronteirasFluxo.push({ ...base, playoff: playoffB })
      continue
    }

    const estilo = f.playoff_estilo as "vagas" | "extra"
    const modo = f.modo as "playoff_acesso" | "playout"
    const playoffVagas = f.playoff_vagas ?? 0
    const vagasFavoraveis =
      modo === "playoff_acesso" ? f.vagas_acesso : f.vagas_rebaixamento

    const leitura = await lerResultadoChave(supabase, f.playoff_tournament_id, {
      modo,
      estilo,
      vagas: vagasFavoraveis,
      playoffVagas,
    })
    if (!leitura.ok) {
      return { ok: false, error: leitura.error }
    }

    const sup = porNivel.get(f.nivel_superior) ?? []
    const inf = porNivel.get(f.nivel_superior + 1) ?? []
    const playoff = combinarFronteiraPlayoff({
      modo,
      estilo,
      vagasAcesso: f.vagas_acesso,
      vagasRebaixamento: f.vagas_rebaixamento,
      superiorOrdenada: sup,
      inferiorOrdenada: inf,
      chaveSobem: leitura.sobem,
      chaveCaem: leitura.caem,
    })

    // Sanidade (gate S9): o nº que sobe/cai DEVE bater com o movimento efetivo —
    // divergência = bug, não perda silenciosa.
    const { sobeEf, caiEf } = movimentoEfetivo({
      modo,
      playoffEstilo: estilo,
      vagasAcesso: f.vagas_acesso,
      vagasRebaixamento: f.vagas_rebaixamento,
    })
    if (playoff.sobem.size !== sobeEf || playoff.caem.size !== caiEf) {
      console.error(
        "calcularFluxoTemporada: divergência playoff",
        `n${f.nivel_superior} sobe ${playoff.sobem.size}/${sobeEf} cai ${playoff.caem.size}/${caiEf}`
      )
      return { ok: false, error: erroGenerico }
    }

    fronteirasFluxo.push({ ...base, playoff })
  }

  // Semente = id da temporada: ESTÁVEL e auditável. Calcular e confirmar (e todo
  // retry) recomputam o MESMO plano — o sorteio de empate é reproduzível e a
  // confirmação é idempotente mesmo quando há empate exato na linha de corte.
  const seed = parsed.data
  const plano = calcularPlanoFluxo(divisoesFluxo, fronteirasFluxo, seed)

  // REMAP de posicaoFinal → posição REAL da tabela (Fase 4). O motor recebeu o
  // rank de corte como `posicao` (igual à real em divisões 'posicao'; rank de
  // promedio em 'promedios'), então `posicaoFinal` carregaria o rank. Reescreve
  // TODOS os itens por competitorId (não por modo/fronteira) para o resultado
  // ESPORTIVO. Fail-fast: competidor sem posição real = bug, não persiste o rank.
  for (const item of plano.itens) {
    const real = posicaoRealPorCompetidor.get(item.competitorId)
    if (real === undefined) {
      console.error(
        "calcularFluxoTemporada: competidor sem posição real no remap",
        item.competitorId
      )
      return { ok: false, error: erroGenerico }
    }
    item.posicaoFinal = real
  }

  return { ok: true, plano }
}

/* -------------------------------------------------------------------------- */
/* confirmarFluxoTemporada — ESCRITA idempotente: persiste entries + monta N+1  */
/* -------------------------------------------------------------------------- */

export type ConfirmarFluxoResult =
  | { ok: true; proximaSeasonId: string }
  | { ok: false; error: string }

/**
 * Confirma o fluxo (escrita idempotente): transiciona a temporada para
 * 'em_fluxo' (TRAVA reabertura via lock), persiste o resultado por competidor em
 * `league_division_entries` (posição/destino/resolvido_por/pontos/jogos),
 * aplica os `ajustes?` do dono (`resolvido_por='override'`), monta a próxima
 * temporada (`montarProximaTemporada`) e encerra a atual ('encerrada').
 *
 * Recalcula o plano internamente (read-only) — NÃO confia num plano vindo do
 * cliente (defesa em profundidade); os ajustes são aplicados POR CIMA do plano
 * recalculado.
 */
export async function confirmarFluxoTemporada(
  input: unknown,
  ajustes?: AjusteFluxo[]
): Promise<ConfirmarFluxoResult> {
  const parsed = seasonIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Temporada inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const erroGenerico = "Não foi possível confirmar o fluxo agora. Tente novamente."
  const erroPropriedade = "Temporada não encontrada ou você não é o dono da liga."

  // Valida os ajustes — Server Action é endpoint direto, não confiar no cliente.
  const ajustesParsed = ajustesFluxoSchema.safeParse(ajustes ?? [])
  if (!ajustesParsed.success) {
    return { ok: false, error: "Ajustes inválidos." }
  }

  // PORTA DE STATUS (posse + ciclo de vida). rascunho = não pronta; ativa = 1ª
  // confirmação; em_fluxo = retomar após falha parcial (idempotente, pois a
  // semente = id da temporada); encerrada = já concluída (retorna a N+1).
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select("status, league_competitions!inner(created_by)")
    .eq("id", parsed.data)
    .eq("league_competitions.created_by", user.id)
    .maybeSingle()
  if (seasonError) {
    return { ok: false, error: erroGenerico }
  }
  if (!season) {
    return { ok: false, error: erroPropriedade }
  }
  if (season.status === "rascunho") {
    return {
      ok: false,
      error: "A temporada ainda não está em disputa. Inicie as divisões primeiro.",
    }
  }
  if (season.status === "encerrada") {
    // Já concluída: devolve a N+1 existente, sem reescrever nada (idempotente).
    const { data: prox } = await supabase
      .from("league_seasons")
      .select("id")
      .eq("previous_season_id", parsed.data)
      .maybeSingle()
    if (prox) {
      return { ok: true, proximaSeasonId: prox.id }
    }
    return { ok: false, error: "Esta temporada já foi encerrada." }
  }

  // Recalcula o plano (posse + gate de divisões encerradas conferidos lá dentro).
  const calc = await calcularFluxoTemporada(parsed.data)
  if (!calc.ok) {
    return { ok: false, error: calc.error }
  }

  // FREEZE camada 3 (Fase 2): toda chave de playoff DEVE estar 'encerrado' antes
  // de montar a N+1 — senão o dono poderia editar um placar da chave DEPOIS de a
  // N+1 ter sido gerada (a season vira 'em_fluxo' e o trigger congela; mas a
  // chave 'ativa' continuaria editável). Exigir 'encerrado' fecha a janela. Duas
  // queries (sem embed ambíguo): pega os ids das chaves, confere o status.
  const { data: boundChaves, error: boundChavesError } = await supabase
    .from("league_boundaries")
    .select("playoff_tournament_id")
    .eq("season_id", parsed.data)
    .not("playoff_tournament_id", "is", null)
  if (boundChavesError) {
    return { ok: false, error: erroGenerico }
  }
  const chaveIds = (boundChaves ?? [])
    .map((b) => b.playoff_tournament_id)
    .filter((id): id is string => id !== null)
  if (chaveIds.length > 0) {
    const { data: abertas, error: abertasError } = await supabase
      .from("tournaments")
      .select("id")
      .in("id", chaveIds)
      .neq("status", "encerrado")
      .limit(1)
    if (abertasError) {
      return { ok: false, error: erroGenerico }
    }
    if (abertas && abertas.length > 0) {
      return {
        ok: false,
        error: "Encerre as chaves de playoff antes de confirmar o fim da temporada.",
      }
    }
  }

  // Override do dono: SÓ permutação dentro dos grupos de sorteio. Cada ajuste
  // precisa recair sobre competidor SORTEADO, com destino/nível coerentes.
  const planoPorCompetidor = new Map(
    calc.plano.itens.map((it) => [it.competitorId, it])
  )
  for (const aj of ajustesParsed.data) {
    const orig = planoPorCompetidor.get(aj.competitorId)
    if (!orig) {
      return { ok: false, error: "Ajuste inválido: competidor fora do plano." }
    }
    if (orig.resolvidoPor !== "sorteio") {
      return {
        ok: false,
        error: "Só competidores empatados por sorteio podem ser ajustados.",
      }
    }
    const nivelEsperado =
      aj.destino === "sobe"
        ? orig.nivelOrigem - 1
        : aj.destino === "cai"
          ? orig.nivelOrigem + 1
          : orig.nivelOrigem
    if (aj.nivelDestino !== nivelEsperado) {
      return { ok: false, error: "Ajuste inválido: destino incoerente com a divisão." }
    }
  }

  const ajustePorCompetidor = new Map(
    ajustesParsed.data.map((a) => [a.competitorId, a])
  )
  const itens: ItemPlanoFluxo[] = calc.plano.itens.map((it) => {
    const aj = ajustePorCompetidor.get(it.competitorId)
    if (!aj) return it
    return {
      ...it,
      destino: aj.destino,
      nivelDestino: aj.nivelDestino,
      resolvidoPor: "override",
    }
  })

  // CONSERVAÇÃO por fronteira: o override não pode mudar QUANTOS sobem/caem em
  // cada divisão (só quem ocupa as vagas). Compara contadores origem→destino
  // antes/depois — divergência = ajuste que quebraria a fronteira.
  const contar = (lista: readonly ItemPlanoFluxo[]) => {
    const m = new Map<string, number>()
    for (const it of lista) {
      const k = `${it.nivelOrigem}:${it.destino}`
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }
  const antes = contar(calc.plano.itens)
  const depois = contar(itens)
  const mesmosContadores =
    antes.size === depois.size && [...antes].every(([k, v]) => depois.get(k) === v)
  if (!mesmosContadores) {
    return {
      ok: false,
      error:
        "O ajuste mudaria quantos sobem ou caem. Só dá para trocar quem ocupa as vagas do empate.",
    }
  }

  // VALIDA o fechamento de tamanho ANTES de qualquer escrita (backstop [2,20]).
  const fechamento = validarFechamentoTamanho(itens)
  if (!fechamento.ok) {
    return {
      ok: false,
      error: `A divisão de nível ${fechamento.nivel} terminaria com ${fechamento.tamanho} competidores (fora de ${DIVISAO_MIN_TAMANHO}-${DIVISAO_MAX_TAMANHO}). Ajuste antes de confirmar.`,
    }
  }

  // (1) season → 'em_fluxo' (trava reabertura). Idempotente: filtra 'ativa';
  // re-rodar após 'em_fluxo' não regride (0 linhas, mas seguimos persistindo).
  const { error: emFluxoError } = await supabase
    .from("league_seasons")
    .update({ status: "em_fluxo" })
    .eq("id", parsed.data)
    .eq("status", "ativa")
  if (emFluxoError) {
    return { ok: false, error: erroGenerico }
  }

  // (2) Persiste o resultado por competidor nas entries. UPDATE por divisão →
  // competidor (idempotente: re-rodar reescreve os mesmos valores).
  // Precisa do division_season_id de cada competidor (= a divisão de ORIGEM).
  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("id, nivel")
    .eq("season_id", parsed.data)
  if (divsError || !divisoes) {
    return { ok: false, error: erroGenerico }
  }
  const divisionSeasonIdPorNivel = new Map<number, string>(
    divisoes.map((d) => [d.nivel, d.id])
  )

  for (const it of itens) {
    const divisionSeasonId = divisionSeasonIdPorNivel.get(it.nivelOrigem)
    if (!divisionSeasonId) continue
    const { error } = await supabase
      .from("league_division_entries")
      .update({
        posicao_final: it.posicaoFinal,
        destino: it.destino,
        resolvido_por: it.resolvidoPor,
        pontos: it.pontos,
        jogos: it.jogos,
      })
      .eq("division_season_id", divisionSeasonId)
      .eq("competitor_id", it.competitorId)
    if (error) {
      return { ok: false, error: erroGenerico }
    }
  }

  // (3) Monta a próxima temporada (cria N+1 + realoca + RPC). Idempotente.
  const prox = await montarProximaTemporada(parsed.data, itens)
  if (!prox.ok) {
    return { ok: false, error: prox.error }
  }

  // (4) season(N) → 'encerrada' (congela). Idempotente (filtra 'em_fluxo').
  const { error: encerrarError } = await supabase
    .from("league_seasons")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("status", "em_fluxo")
  if (encerrarError) {
    return { ok: false, error: erroGenerico }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${parsed.data}`)
  return { ok: true, proximaSeasonId: prox.proximaSeasonId }
}

/* -------------------------------------------------------------------------- */
/* montarProximaTemporada — cria N+1, realoca competidores, chama a RPC          */
/* -------------------------------------------------------------------------- */

export type MontarProximaResult =
  | { ok: true; proximaSeasonId: string }
  | { ok: false; error: string }

/**
 * Monta a temporada N+1 a partir do plano de fluxo de N: cria
 * `league_seasons(numero=N+1, previous_season_id=N)`, realoca cada competidor ao
 * destino (o técnico `holder_user_id` ACOMPANHA — vive no competidor
 * persistente, nada a copiar), VALIDA o fechamento de tamanho e REJEITA (sem
 * escrita) se alguma divisão sair de [2,20]; cria as `league_division_seasons` da
 * N+1 ANTES dos tournaments (sentinela) + as entries realocadas; depois chama a
 * RPC `montar_temporada(N+1)`.
 *
 * Idempotência: `league_seasons_numero_unico` (a temporada não duplica) +
 * sentinela `tournament_id` (a montagem completa só o que faltou). Re-rodar após
 * falha parcial reaproveita a N+1 já criada.
 */
export async function montarProximaTemporada(
  seasonId: string,
  itens: readonly ItemPlanoFluxo[]
): Promise<MontarProximaResult> {
  const supabase = await createClient()

  const erroGenerico =
    "Não foi possível montar a próxima temporada agora. Tente novamente."

  // (0) VALIDA o fechamento de tamanho ANTES de escrever (rejeita <2 ou >20).
  const fechamento = validarFechamentoTamanho(itens)
  if (!fechamento.ok) {
    return {
      ok: false,
      error: `A divisão de nível ${fechamento.nivel} terminaria com ${fechamento.tamanho} competidores (fora de ${DIVISAO_MIN_TAMANHO}-${DIVISAO_MAX_TAMANHO}). Ajuste antes de confirmar.`,
    }
  }

  // Carrega a temporada atual (numero, competition) e as divisões de N (geometria
  // a copiar: nível → {nome, por_nome, desempate}).
  const { data: seasonAtual, error: seasonError } = await supabase
    .from("league_seasons")
    .select("id, numero, competition_id")
    .eq("id", seasonId)
    .maybeSingle()
  if (seasonError || !seasonAtual) {
    return { ok: false, error: erroGenerico }
  }

  const { data: divisoesN, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("nivel, nome, por_nome, desempate, ranking_base")
    .eq("season_id", seasonId)
    .order("nivel")
  if (divsError || !divisoesN || divisoesN.length === 0) {
    return { ok: false, error: erroGenerico }
  }
  const geometriaPorNivel = new Map(divisoesN.map((d) => [d.nivel, d]))

  // (1) Cria (ou recupera) a temporada N+1. league_seasons_numero_unico barra a
  // dupla criação (23505 em corrida → recupera a já criada).
  let proximaSeasonId: string
  const { data: nova, error: novaError } = await supabase
    .from("league_seasons")
    .insert({
      competition_id: seasonAtual.competition_id,
      numero: seasonAtual.numero + 1,
      previous_season_id: seasonAtual.id,
      status: "rascunho",
    })
    .select("id")
    .single()
  if (novaError || !nova) {
    if (novaError?.code === "23505") {
      // Já criada (retry) — recupera por (competition, numero).
      const { data: existente, error: exError } = await supabase
        .from("league_seasons")
        .select("id")
        .eq("competition_id", seasonAtual.competition_id)
        .eq("numero", seasonAtual.numero + 1)
        .maybeSingle()
      if (exError || !existente) {
        return { ok: false, error: erroGenerico }
      }
      proximaSeasonId = existente.id
    } else {
      console.error("montarProximaTemporada: temporada", novaError?.code ?? novaError?.message)
      return { ok: false, error: erroGenerico }
    }
  } else {
    proximaSeasonId = nova.id
  }

  // (1.5) FRONTEIRAS da N+1: a pirâmide é imortal, então o acesso/queda se repete
  // a cada temporada. Sem copiar `league_boundaries`, a N+1 nasceria sem sobe/cai
  // (todos permaneceriam para sempre). Idempotente: pula as já existentes (UNIQUE
  // (season_id, nivel_superior)).
  const { data: fronteirasN, error: frontNError } = await supabase
    .from("league_boundaries")
    .select(
      "nivel_superior, vagas_acesso, vagas_rebaixamento, modo, playoff_vagas, playoff_estilo, playoff_ida_e_volta"
    )
    .eq("season_id", seasonId)
  if (frontNError) {
    return { ok: false, error: erroGenerico }
  }
  if (fronteirasN && fronteirasN.length > 0) {
    const { data: fronteirasProx, error: frontProxError } = await supabase
      .from("league_boundaries")
      .select("nivel_superior")
      .eq("season_id", proximaSeasonId)
    if (frontProxError) {
      return { ok: false, error: erroGenerico }
    }
    const niveisFronteira = new Set(
      (fronteirasProx ?? []).map((f) => f.nivel_superior)
    )
    const fronteirasParaCriar = fronteirasN
      .filter((f) => !niveisFronteira.has(f.nivel_superior))
      .map((f) => ({
        season_id: proximaSeasonId,
        nivel_superior: f.nivel_superior,
        vagas_acesso: f.vagas_acesso,
        vagas_rebaixamento: f.vagas_rebaixamento,
        modo: f.modo,
        playoff_vagas: f.playoff_vagas,
        // Copiar estilo + leg (Fase 2): sem isto a N+1 nasceria modo=playoff_*
        // com estilo nulo e o CHECK league_boundaries_estilo_coerente estouraria.
        playoff_estilo: f.playoff_estilo,
        playoff_ida_e_volta: f.playoff_ida_e_volta,
      }))
    if (fronteirasParaCriar.length > 0) {
      const { error } = await supabase
        .from("league_boundaries")
        .insert(fronteirasParaCriar)
      // 23505 = corrida de confirmação concorrente (duas abas) já inseriu esta
      // fronteira; o estado fica correto (UNIQUE garante), então é no-op — mesmo
      // espírito do retry da própria season N+1.
      if (error && error.code !== "23505") {
        console.error(
          "montarProximaTemporada: fronteiras N+1",
          error.code ?? error.message
        )
        return { ok: false, error: erroGenerico }
      }
    }
  }

  // (2) Divisões da N+1 (geometria copiada, tamanho = fechamento). Cria ANTES dos
  // tournaments (sentinela). Idempotente: pula as que já existem (UNIQUE nível).
  const { data: divsProx, error: divsProxError } = await supabase
    .from("league_division_seasons")
    .select("id, nivel")
    .eq("season_id", proximaSeasonId)
  if (divsProxError) {
    return { ok: false, error: erroGenerico }
  }
  const niveisExistentes = new Set((divsProx ?? []).map((d) => d.nivel))

  const divisoesParaCriar = [...fechamento.tamanhos.entries()]
    .filter(([nivel]) => !niveisExistentes.has(nivel))
    .map(([nivel, tamanho]) => {
      const geo = geometriaPorNivel.get(nivel)
      return {
        season_id: proximaSeasonId,
        nivel,
        nome: geo?.nome ?? `Divisão ${nivel}`,
        por_nome: geo?.por_nome ?? false,
        desempate: geo?.desempate ?? "cbf",
        // Fase 4: copiar a base de ranking — sem isto a N+1 cairia para 'posicao'
        // silenciosamente (perdendo o promedio configurado).
        ranking_base: geo?.ranking_base ?? "posicao",
        tamanho,
      }
    })

  if (divisoesParaCriar.length > 0) {
    const { error } = await supabase
      .from("league_division_seasons")
      .insert(divisoesParaCriar)
    if (error) {
      console.error("montarProximaTemporada: divisões N+1", error.code ?? error.message)
      return { ok: false, error: erroGenerico }
    }
  }

  // Recarrega as divisões da N+1 (com os ids) para ligar as entries por nível.
  const { data: divsProxFinal, error: divsProxFinalError } = await supabase
    .from("league_division_seasons")
    .select("id, nivel")
    .eq("season_id", proximaSeasonId)
  if (divsProxFinalError || !divsProxFinal) {
    return { ok: false, error: erroGenerico }
  }
  const divisionSeasonIdPorNivel = new Map<number, string>(
    divsProxFinal.map((d) => [d.nivel, d.id])
  )

  // (3) Entries realocadas (competidor → divisão de DESTINO em N+1), sem slot_id.
  //     Idempotente: pula as que já existem (UNIQUE division_season+competitor).
  const { data: entriesExistentes, error: exError } = await supabase
    .from("league_division_entries")
    .select("division_season_id, competitor_id")
    .in(
      "division_season_id",
      divsProxFinal.map((d) => d.id)
    )
  if (exError) {
    return { ok: false, error: erroGenerico }
  }
  const jaExiste = new Set(
    (entriesExistentes ?? []).map((e) => `${e.division_season_id}:${e.competitor_id}`)
  )

  const novasEntries = itens
    .map((it) => {
      const divisionSeasonId = divisionSeasonIdPorNivel.get(it.nivelDestino)
      if (!divisionSeasonId) return null
      const chave = `${divisionSeasonId}:${it.competitorId}`
      if (jaExiste.has(chave)) return null
      return {
        division_season_id: divisionSeasonId,
        competitor_id: it.competitorId,
      }
    })
    .filter((e): e is { division_season_id: string; competitor_id: string } => e !== null)

  if (novasEntries.length > 0) {
    const { error } = await supabase
      .from("league_division_entries")
      .insert(novasEntries)
    if (error) {
      console.error("montarProximaTemporada: entries N+1", error.code ?? error.message)
      return { ok: false, error: erroGenerico }
    }
  }

  // (4) RPC monta os tournaments + slots da N+1 (idempotente pela sentinela).
  try {
    const { error } = await supabase.rpc("montar_temporada", {
      p_season_id: proximaSeasonId,
    })
    if (error) {
      return { ok: false, error: mensagemDaMontagem(error) }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { action: "montarProximaTemporada" } })
    return { ok: false, error: erroGenerico }
  }

  return { ok: true, proximaSeasonId }
}
