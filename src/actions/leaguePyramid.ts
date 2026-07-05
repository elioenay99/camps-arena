"use server"

import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { iniciarTorneio } from "@/actions/tournaments"
import { podeGerir } from "@/lib/autorizacao"
import { gerarChaveSemeada } from "@/features/knockout/data/gerarChaveSemeada"
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao"
import {
  gerarBarragemPares,
  resultadoBarragemPares,
  resultadoDaChave,
  semearPlayoffPorPosicao,
  type ConfrontoChave,
  type PartidaJogada,
} from "@/features/knockout/gerarChaveMataMata"
import { createClient } from "@/lib/supabase/server"
import { premiarEEncerrarTemporada } from "@/features/league/data/premiarEEncerrarTemporada"
import { coresOpcionais, type CoresInput } from "@/schema/corSchema"
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
  prngDeSemente,
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
import {
  carregarLinhasBaseDivisao,
  type LinhasBaseDivisao,
} from "@/features/league/data/carregarLinhasBaseDivisao"
import { gerarFaseGruposSemeada } from "@/features/groups/montarFaseGruposPiramide"
import { validarGeometria } from "@/features/groups/gerarFaseDeGrupos"

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
      // Cores DEFAULT da pirâmide (change add-cores-campeonato): cada divisão
      // herda estas quando a própria cor é null (resolvido na leitura).
      cor_primaria: dados.corPrimaria ?? null,
      cor_secundaria: dados.corSecundaria ?? null,
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

  // (2) Temporada 1 (rascunho). Fase 5.1: grava o `ciclo` (anual/apertura_clausura).
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .insert({
      competition_id: competitionId,
      numero: 1,
      status: "rascunho",
      ciclo: dados.ciclo,
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
        // Fase 5.2: formato interno + geometria de grupos (null em liga).
        formato: div.formato,
        qtd_grupos: div.qtdGrupos ?? null,
        classificados_por_grupo: div.classificadosPorGrupo ?? null,
        // Turno da divisão (change add-ida-volta-divisao): só vale em liga; em
        // grupos_mata_mata o servidor força false (normalização liga-only).
        ida_e_volta: div.formato === "liga" ? div.idaEVolta : false,
        tamanho: div.tamanho,
        // Cores da divisão (change add-cores-campeonato): null = herda a cor da
        // competição na leitura. `montarProximaTemporada` copia nas N+1 (2 pontas).
        cor_primaria: div.corPrimaria ?? null,
        cor_secundaria: div.corSecundaria ?? null,
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
    // Backstop de corrida: os índices únicos parciais de `league_competitors`
    // são por (competition_id, team_id) e (competition_id, lower(trim(rotulo))),
    // logo abrangem a temporada inteira. O `superRefine` já barra a repetição
    // cross-divisão; o 23505 só dispara em concorrência — mensagem específica.
    if (compsError?.code === "23505") {
      return {
        error:
          "Um clube ou nome está repetido entre as divisões da temporada. Remova a duplicata e tente de novo.",
      }
    }
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
  // Erros específicos da Fase 5.1 (split + grande final).
  if (m.includes("SPLIT_SO_LIGA")) {
    return "Apertura/Clausura só aceita divisões de liga. Ajuste a liga antes de montar."
  }
  if (m.includes("GRANDE_FINAL_IDS_INVALIDOS")) {
    return "A grande final precisa de dois campeões distintos."
  }
  if (m.includes("FINAL_POR_NOME_INCOERENTE")) {
    return "A divisão da final mistura clube e nome — incoerente."
  }
  if (m.includes("COMPETIDOR_INEXISTENTE")) {
    return "Competidor não encontrado."
  }
  // DIVISAO_INVALIDA por ÚLTIMO (após DIVISAO_SEM_*/DIVISAO_FONTE_* já testados acima).
  if (m.includes("DIVISAO_INVALIDA")) {
    return "Divisão não encontrada."
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
 * temporada para 'ativa'. Autorização por CAPACIDADE (`podeGerir` = dono ou
 * admin de liga — herança via `pode_gerir_competition`) + RLS como backstop.
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

  const erroPropriedade = "Divisão não encontrada ou você não tem acesso a esta liga."

  // Carrega a divisão + season + competition_id (para a checagem de capacidade).
  // Fase 5.2: formato/qtd_grupos/classificados_por_grupo + ida_e_volta da Apertura.
  // Fase 5.1: ciclo da season + tournament_id_clausura + status das DUAS meias
  // (embeds DESAMBIGUADOS por FK — há 3 FKs league_division_seasons→tournaments).
  const { data: divisao, error: divError } = await supabase
    .from("league_division_seasons")
    .select(
      `id, tournament_id, tournament_id_clausura, season_id, formato, qtd_grupos, classificados_por_grupo,
       apertura:tournaments!league_division_seasons_tournament_id_fkey(status, ida_e_volta),
       clausura:tournaments!league_division_seasons_tournament_id_clausura_fkey(status),
       league_seasons!inner(ciclo, league_competitions!inner(id))`
    )
    .eq("id", parsed.data)
    .maybeSingle()
  if (divError) {
    return { ok: false, error: "Não foi possível iniciar a divisão agora. Tente novamente." }
  }
  if (!divisao || !divisao.tournament_id) {
    // Divisão inexistente, de liga sem acesso, ou ainda não montada (sem torneio).
    return { ok: false, error: erroPropriedade }
  }

  // Autorização por CAPACIDADE: gerir (dono ou admin de liga). Substitui o filtro
  // transitivo por `created_by` — a herança de admin de liga passa a funcionar.
  const competitionId = (
    divisao.league_seasons as unknown as {
      league_competitions: { id: string } | null
    } | null
  )?.league_competitions?.id
  if (!competitionId || !(await podeGerir(supabase, { competitionId }))) {
    return { ok: false, error: erroPropriedade }
  }

  const apertura = divisao.apertura as unknown as
    | { status: string; ida_e_volta: boolean }
    | null
  const clausura = divisao.clausura as unknown as { status: string } | null
  const ciclo =
    (divisao.league_seasons as unknown as { ciclo: string } | null)?.ciclo ?? "anual"
  const ehSplit = ciclo === "apertura_clausura" && divisao.tournament_id_clausura != null

  // Inicia UMA meia. O ramo de grupos (`grupos_mata_mata`, 5.2) gera a fase SEMEADA
  // via `gerarFaseGruposSemeada`, que é idempotente E AUTO-RECUPERA de crash (torneio
  // 'ativo' SEM partidas ⇒ rebaixa p/ rascunho e regenera) — por isso NÃO leva
  // pré-check: chamamos sempre, mesmo com status 'ativo' (regressão MEDIUM: o
  // pré-check matava essa recuperação). `grupos_mata_mata` só ocorre em season ANUAL
  // (split é liga-only via SPLIT_SO_LIGA), logo o ramo split nunca cai aqui.
  //
  // O ramo liga/clausura usa `iniciarTorneio`, que NÃO é idempotente para torneio já
  // fora de rascunho (filtra `.eq status 'rascunho'` e retorna erro) — daí o PRÉ-CHECK
  // de status que pula a meia já iniciada (= sucesso), permitindo que um retry de start
  // PARCIAL (Apertura ok, Clausura falhou) complete só o que falta. Split é só liga ⇒
  // a Clausura é sempre liga.
  const iniciarMeia = async (
    tournamentId: string,
    status: string | undefined
  ): Promise<LeaguePyramidResult> => {
    if (divisao.formato === "grupos_mata_mata") {
      const rng = prngDeSemente(`${divisao.season_id}:${divisao.id}`)
      return gerarFaseGruposSemeada(supabase, tournamentId, {
        qtdGrupos: divisao.qtd_grupos ?? 0,
        classificadosPorGrupo: divisao.classificados_por_grupo ?? 0,
        idaEVolta: apertura?.ida_e_volta ?? false,
        randInt: (n: number) => Math.floor(rng() * n),
      })
    }
    if (status !== "rascunho") return { ok: true } // já iniciada — pula (idempotente)
    return iniciarTorneio(tournamentId)
  }

  // Apertura.
  let r = await iniciarMeia(divisao.tournament_id, apertura?.status)
  if (!r.ok) return r
  // Clausura (só split): bloco INDEPENDENTE.
  if (ehSplit && divisao.tournament_id_clausura) {
    r = await iniciarMeia(divisao.tournament_id_clausura, clausura?.status)
    if (!r.ok) return r
  }

  // Se TODAS as divisões já saíram de rascunho, a temporada vira 'ativa'. No split,
  // EXIGE as DUAS meias fora de rascunho (HIGH-1: a season não pode flipar para
  // 'ativa' com alguma Clausura ainda em rascunho).
  const seasonId = divisao.season_id
  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select(
      `tournament_id, tournament_id_clausura,
       apertura:tournaments!league_division_seasons_tournament_id_fkey(status),
       clausura:tournaments!league_division_seasons_tournament_id_clausura_fkey(status)`
    )
    .eq("season_id", seasonId)
  if (!divsError && divisoes) {
    const todasIniciadas =
      divisoes.length > 0 &&
      divisoes.every((d) => {
        const ap = d.apertura as unknown as { status: string } | null
        const cl = d.clausura as unknown as { status: string } | null
        const aperturaOk =
          d.tournament_id !== null && ap !== null && ap.status !== "rascunho"
        const clausuraOk =
          d.tournament_id_clausura === null ||
          (cl !== null && cl.status !== "rascunho")
        return aperturaOk && clausuraOk
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
/* atualizarIdaEVoltaDivisao — turno (ida-e-volta) de uma divisão em rascunho   */
/* -------------------------------------------------------------------------- */

const idaVoltaDivisaoSchema = z.object({
  divisionSeasonId: z.uuid({ error: "Divisão inválida." }),
  // `seasonId` é só para revalidar a página da liga (não tem papel de segurança —
  // a autorização real é por capacidade DENTRO da RPC, chaveada pela divisão).
  seasonId: z.uuid({ error: "Temporada inválida." }),
  idaEVolta: z.boolean({ error: "Valor inválido." }),
})

/** Mapeia as exceções da RPC `atualizar_ida_e_volta_divisao` para pt-BR. */
function mensagemDoTurno(error: { message?: string }): string {
  const m = error.message ?? ""
  if (m.includes("NAO_AUTORIZADO")) {
    return "Você não tem permissão para alterar esta divisão."
  }
  if (m.includes("FORMATO_INVALIDO")) {
    return "Só divisões de liga têm turno único ou ida e volta."
  }
  if (m.includes("JA_INICIADA")) {
    return "A divisão já foi iniciada — o turno não pode mais mudar."
  }
  if (m.includes("JA_TEM_RODADAS")) {
    return "A divisão já tem rodadas geradas — o turno não pode mais mudar."
  }
  if (m.includes("DIVISAO_INVALIDA")) {
    return "Divisão não encontrada."
  }
  return "Não foi possível alterar o turno agora. Tente novamente."
}

/**
 * Alterna o turno (ida-e-volta) de UMA divisão de liga AINDA EM RASCUNHO, sem
 * recriar a pirâmide. Thin sobre a RPC `SECURITY DEFINER` transacional
 * `atualizar_ida_e_volta_divisao` (escreve a division-season + o[s] torneio[s]
 * numa só tx; autoriza por capacidade; barra divisão já iniciada/com rodadas).
 */
export async function atualizarIdaEVoltaDivisao(input: unknown): Promise<LeaguePyramidResult> {
  const parsed = idaVoltaDivisaoSchema.safeParse(input)
  if (!parsed.success) {
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

  try {
    const { error } = await supabase.rpc("atualizar_ida_e_volta_divisao", {
      p_division_season_id: parsed.data.divisionSeasonId,
      p_ida_e_volta: parsed.data.idaEVolta,
    })
    if (error) {
      return { ok: false, error: mensagemDoTurno(error) }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { action: "atualizarIdaEVoltaDivisao" } })
    return { ok: false, error: "Não foi possível alterar o turno agora. Tente novamente." }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${parsed.data.seasonId}`)
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
 * partidas já existem (retomada parcial). Autorização por CAPACIDADE (`podeGerir`
 * = dono ou admin de liga) + RLS como backstop.
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
  const erroPropriedade = "Temporada não encontrada ou você não tem acesso a esta liga."

  // Capacidade + status: a temporada precisa estar 'ativa' (em disputa). Fase 5.1:
  // `ciclo` alimenta `carregarLinhasBaseDivisao` (split).
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select("id, status, ciclo, competition_id")
    .eq("id", parsed.data)
    .maybeSingle()
  if (seasonError) {
    return { ok: false, error: erroGenerico }
  }
  if (!season) {
    return { ok: false, error: erroPropriedade }
  }
  // Autorização por CAPACIDADE: gerir (dono ou admin de liga).
  if (!(await podeGerir(supabase, { competitionId: season.competition_id }))) {
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

  // Fase 5.1: o status/encerramento (e a linhasBase) vêm de
  // `carregarLinhasBaseDivisao` — sem o embed `tournament`.
  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("id, nivel, tournament_id, tournament_id_clausura, formato, ranking_base, desempate")
    .eq("season_id", parsed.data)
    .order("nivel")
  if (divsError || !divisoes) {
    return { ok: false, error: erroGenerico }
  }
  // GATE: todas as divisões encerradas para o fluxo (a chave usa a classificação
  // final = combinada no split). FONTE ÚNICA — e CACHEIA a linhasBase por divisão
  // para `carregarDivisao` (evita re-fetch da combinada). MESMO gate do fluxo.
  const baseCache = new Map<string, LinhasBaseDivisao>()
  for (const div of divisoes) {
    if (!div.tournament_id) {
      return { ok: false, error: "Encerre todas as divisões antes de montar os playoffs." }
    }
    const base = await carregarLinhasBaseDivisao(supabase, {
      tournament_id: div.tournament_id,
      tournament_id_clausura: div.tournament_id_clausura,
      formato: div.formato,
      desempate: div.desempate,
      ciclo: season.ciclo,
    })
    if (!base) {
      return { ok: false, error: erroGenerico }
    }
    if (!base.encerradaParaFluxo) {
      return {
        ok: false,
        error:
          "Encerre todas as divisões (e as duas meias, no caso de Apertura/Clausura) antes de montar os playoffs.",
      }
    }
    baseCache.set(div.id, base)
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
    // Fase 5.1: a linhasBase (combinada no split; agregado/liga no anual) já foi
    // computada no GATE acima e cacheada — mesma fonte do fluxo (montagem ≡ cálculo).
    const base = baseCache.get(div.id)
    if (!base) return null
    const linhasBase = base.linhasBase
    const linhasReais: LinhaReal[] = []
    for (const l of linhasBase) {
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
/* montarGrandesFinais — Fase 5.1: a grande final (decorativa) por divisão split */
/* -------------------------------------------------------------------------- */

/**
 * Monta a GRANDE FINAL (mata-mata ida-e-volta) entre o campeão da Apertura e o da
 * Clausura de cada divisão split com as DUAS meias encerradas, sem final e com
 * campeões DISTINTOS. Decorativa: NÃO entra no sobe/cai (combinada) nem gateia o
 * fluxo — só coroa o campeão da divisão (5.1c). Campeão Apertura == Clausura ⇒
 * campeão DIRETO (não monta). Idempotente (sentinela `final_tournament_id` na RPC +
 * `gerarChaveSemeada`). Divisões ainda não prontas (meia em aberto) são puladas em
 * silêncio (outras montam). Posse por FILTRO transitivo + RLS.
 *
 * Resolução DUAL do campeão: Apertura via `entries.slot_id` (slot canônico);
 * Clausura via `tournament_slots.competitor_id` do slot vencedor (a entry aponta só
 * para a Apertura). Empate na posição 1 ⇒ `.find(l => l.posicao===1)` (linhas já
 * ordenadas por id) garante exatamente 1 id por meia.
 */
export async function montarGrandesFinais(input: unknown): Promise<LeaguePyramidResult> {
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

  const erroGenerico = "Não foi possível montar as grandes finais agora. Tente novamente."
  const erroPropriedade = "Temporada não encontrada ou você não tem acesso a esta liga."

  // Capacidade + ciclo: só faz sentido numa temporada split.
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select("id, ciclo, competition_id")
    .eq("id", parsed.data)
    .maybeSingle()
  if (seasonError) {
    return { ok: false, error: erroGenerico }
  }
  if (!season) {
    return { ok: false, error: erroPropriedade }
  }
  // Autorização por CAPACIDADE: gerir (dono ou admin de liga).
  if (!(await podeGerir(supabase, { competitionId: season.competition_id }))) {
    return { ok: false, error: erroPropriedade }
  }
  if (season.ciclo !== "apertura_clausura") {
    return { ok: false, error: "Esta temporada não é de Apertura/Clausura." }
  }

  // Divisões SPLIT (têm a Clausura).
  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("id, tournament_id, tournament_id_clausura, final_tournament_id")
    .eq("season_id", parsed.data)
    .not("tournament_id_clausura", "is", null)
  if (divsError || !divisoes) {
    return { ok: false, error: erroGenerico }
  }

  for (const div of divisoes) {
    if (!div.tournament_id || !div.tournament_id_clausura) continue

    // Classificação por TURNO (o campeão = posição 1 de cada meia).
    let apClass, clClass
    try {
      apClass = await getTournamentClassificacao(div.tournament_id)
      clClass = await getTournamentClassificacao(div.tournament_id_clausura)
    } catch (e) {
      console.error("montarGrandesFinais: classificação", e instanceof Error ? e.message : e)
      return { ok: false, error: erroGenerico }
    }
    if (!apClass || !clClass) {
      return { ok: false, error: erroGenerico }
    }
    // Só monta quando AS DUAS meias estão encerradas (gate da divisão). Outras
    // divisões podem montar mesmo que esta ainda não esteja pronta.
    if (apClass.torneio.status !== "encerrado" || clClass.torneio.status !== "encerrado") {
      continue
    }

    const campeaoApSlot = apClass.linhas.find((l) => l.posicao === 1)?.participanteId
    const campeaoClSlot = clClass.linhas.find((l) => l.posicao === 1)?.participanteId
    if (!campeaoApSlot || !campeaoClSlot) continue

    // Resolução DUAL: Apertura via entries.slot_id; Clausura via competitor_id do slot.
    const { data: entries, error: entriesError } = await supabase
      .from("league_division_entries")
      .select("competitor_id, slot_id")
      .eq("division_season_id", div.id)
    if (entriesError) {
      return { ok: false, error: erroGenerico }
    }
    const compPorAperturaSlot = new Map<string, string>()
    for (const e of entries ?? []) {
      if (e.slot_id) compPorAperturaSlot.set(e.slot_id, e.competitor_id)
    }
    const { data: clSlots, error: clSlotsError } = await supabase
      .from("tournament_slots")
      .select("id, competitor_id")
      .eq("tournament_id", div.tournament_id_clausura)
    if (clSlotsError) {
      return { ok: false, error: erroGenerico }
    }
    const compPorClausuraSlot = new Map<string, string>()
    for (const s of clSlots ?? []) {
      if (s.competitor_id) compPorClausuraSlot.set(s.id, s.competitor_id)
    }

    const campeaoAp = compPorAperturaSlot.get(campeaoApSlot)
    const campeaoCl = compPorClausuraSlot.get(campeaoClSlot)
    if (!campeaoAp || !campeaoCl) {
      return { ok: false, error: erroGenerico }
    }

    // Campeão DIRETO: o mesmo competidor venceu os dois turnos → sem final.
    if (campeaoAp === campeaoCl) continue

    // RPC cria (ou retorna) o tournaments da final + 2 slots na ordem [Ap, Cl].
    const { data: finalId, error: rpcError } = await supabase.rpc("montar_grande_final", {
      p_division_season_id: div.id,
      p_competitor_ids: [campeaoAp, campeaoCl],
    })
    if (rpcError || !finalId) {
      return { ok: false, error: mensagemDaMontagem(rpcError ?? { message: "" }) }
    }

    // Slots da final → confronto semeado (campeão Apertura é o lado 1; ida-e-volta).
    const { data: finalSlots, error: finalSlotsError } = await supabase
      .from("tournament_slots")
      .select("id, competitor_id")
      .eq("tournament_id", finalId)
    if (finalSlotsError || !finalSlots) {
      return { ok: false, error: erroGenerico }
    }
    const slotPorComp = new Map<string, string>()
    for (const s of finalSlots) {
      if (s.competitor_id) slotPorComp.set(s.competitor_id, s.id)
    }
    const s1 = slotPorComp.get(campeaoAp)
    const s2 = slotPorComp.get(campeaoCl)
    if (!s1 || !s2) {
      return { ok: false, error: erroGenerico }
    }

    let confrontos
    try {
      confrontos = semearPlayoffPorPosicao([s1, s2])
    } catch (e) {
      console.error("montarGrandesFinais: seeding", e instanceof Error ? e.message : e)
      return { ok: false, error: erroGenerico }
    }
    // IDA E VOLTA (decisão 5.1a): a grande final tem UM confronto, então o
    // `gerarFaseInicial` padrão o trataria como `ehFinal` → jogo único, ignorando
    // ida-e-volta. Passamos `gerarBarragemPares` (mesma saída da barragem `pares`)
    // para FORÇAR as duas pernas — idêntico ao furo de `ehFinal` da Fase 3.
    const r = await gerarChaveSemeada(
      supabase,
      finalId,
      confrontos,
      true,
      gerarBarragemPares
    )
    if (!r.ok) {
      return { ok: false, error: r.error }
    }
  }

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
 * de fluxo (2 cliques: calcular → confirmar). Autorização por CAPACIDADE
 * (`podeGerir` = dono ou admin de liga) + RLS como backstop.
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
  const erroPropriedade = "Temporada não encontrada ou você não tem acesso a esta liga."

  // Capacidade + carrega divisões (com tournament_id) e fronteiras.
  // Fase 5.1: `ciclo` da season alimenta `carregarLinhasBaseDivisao` (split).
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select("id, status, ciclo, competition_id")
    .eq("id", parsed.data)
    .maybeSingle()
  if (seasonError) {
    return { ok: false, error: erroGenerico }
  }
  if (!season) {
    return { ok: false, error: erroPropriedade }
  }
  // Autorização por CAPACIDADE: gerir (dono ou admin de liga).
  if (!(await podeGerir(supabase, { competitionId: season.competition_id }))) {
    return { ok: false, error: erroPropriedade }
  }

  // Fase 5.1: o status/encerramento da divisão é resolvido por
  // `carregarLinhasBaseDivisao` (que cobre o split) — sem o embed `tournament`.
  const { data: divisoes, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("id, nivel, tournament_id, tournament_id_clausura, ranking_base, formato, desempate")
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

    // Fase 5.1: FONTE ÚNICA da linhasBase + do gate de encerramento. No split a
    // linhasBase é a tabela ANUAL COMBINADA e `encerradaParaFluxo` exige AS DUAS
    // meias encerradas; no anual é byte-idêntico ao 5.2 (linhasFaseGrupos ?? linhas
    // + gate de grupos completos).
    const base = await carregarLinhasBaseDivisao(supabase, {
      tournament_id: div.tournament_id,
      tournament_id_clausura: div.tournament_id_clausura,
      formato: div.formato,
      desempate: div.desempate,
      ciclo: season.ciclo,
    })
    if (!base) {
      return { ok: false, error: erroGenerico }
    }
    if (!base.encerradaParaFluxo) {
      return {
        ok: false,
        error:
          "Há divisão ainda em andamento. Encerre todas as divisões (e as duas meias, no caso de Apertura/Clausura) antes de calcular o fluxo.",
      }
    }

    // slot_id → competitor_id (via entries da divisão). No split as entries seguem
    // ligadas ao slot da APERTURA (a combinada também chaveia por ele).
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

    // Linhas REAIS (posição da tabela do ano). Alimentam o remap de posicaoFinal,
    // o promedio (campanha ao vivo) e — quando ranking_base='posicao' — o corte.
    // `linhasBase` = combinada (split) ou agregado de grupos/liga (anual). Os
    // pontos/jogos são SOMA do ano no split (NUNCA um turno só nem a grande final).
    const linhasBase = base.linhasBase
    const linhasReais: LinhaReal[] = []
    for (const linha of linhasBase) {
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

  // (4) PREMIAR → FLIP para 'encerrada' → PUSH best-effort. Extraído em
  // `premiarEEncerrarTemporada` para travar a ordem por teste: a RPC de premiação
  // (writer autoritativo) roda com a season ainda 'em_fluxo'; falha ⇒ `{ok:false}`
  // ANTES do flip (re-run reexecuta idempotente); o flip é o ÚLTIMO write; o push
  // só sai DEPOIS do flip. Ver os comentários/testes do helper.
  const fin = await premiarEEncerrarTemporada(supabase, parsed.data, user.id, itens)
  if (!fin.ok) {
    return { ok: false, error: fin.error }
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
// Interna (LOW fix-lows-latentes D2): o único caller é `confirmarFluxoTemporada`
// no mesmo módulo. Sem `export` ela some da superfície de Server Actions (fecha o
// endpoint redundante); RLS + RPC `montar_temporada` DEFINER já barram o abuso.
async function montarProximaTemporada(
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
    .select("id, numero, competition_id, ciclo")
    .eq("id", seasonId)
    .maybeSingle()
  if (seasonError || !seasonAtual) {
    return { ok: false, error: erroGenerico }
  }

  const { data: divisoesN, error: divsError } = await supabase
    .from("league_division_seasons")
    .select("nivel, nome, por_nome, desempate, ranking_base, formato, qtd_grupos, classificados_por_grupo, cor_primaria, cor_secundaria, ida_e_volta")
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
      // Fase 5.1: COPIA o ciclo (senão a pirâmide degrada para single-stage após 1
      // ciclo — mesma classe dos achados ranking_base/formato).
      ciclo: seasonAtual.ciclo,
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
      // Fase 5.2: copiar o formato interno + geometria de grupos — sem isto a
      // divisão de grupos viraria liga na N+1 (sumiria após 1 ciclo). MAS a
      // conservação pode mudar o `tamanho` do nível na N+1, e a geometria herdada
      // (qtd_grupos × K) talvez não FECHE a chave no novo tamanho → divisão
      // ficaria impossível de iniciar (validarGeometria estouraria). Revalida; se
      // não fecha, REBAIXA para 'liga' (sem geometria) — degradação segura.
      let formato = geo?.formato ?? "liga"
      let qtdGrupos = geo?.qtd_grupos ?? null
      let classificados = geo?.classificados_por_grupo ?? null
      if (formato === "grupos_mata_mata" && qtdGrupos != null && classificados != null) {
        try {
          validarGeometria(tamanho, qtdGrupos, classificados)
        } catch {
          formato = "liga"
          qtdGrupos = null
          classificados = null
        }
      }
      return {
        season_id: proximaSeasonId,
        nivel,
        nome: geo?.nome ?? `Divisão ${nivel}`,
        por_nome: geo?.por_nome ?? false,
        desempate: geo?.desempate ?? "cbf",
        // Fase 4: copiar a base de ranking — sem isto a N+1 cairia para 'posicao'
        // silenciosamente (perdendo o promedio configurado).
        ranking_base: geo?.ranking_base ?? "posicao",
        formato,
        qtd_grupos: qtdGrupos,
        classificados_por_grupo: classificados,
        tamanho,
        // Cores da divisão (change add-cores-campeonato): COPIAR para a N+1 — sem
        // isto a cor cairia para null na N+1 (a divisão perderia a identidade após
        // 1 ciclo). 2ª ponta da cópia (a 1ª é o `.select()` de divisoesN acima).
        cor_primaria: geo?.cor_primaria ?? null,
        cor_secundaria: geo?.cor_secundaria ?? null,
        // Turno da divisão (change add-ida-volta-divisao): COPIAR para a N+1 — sem
        // isto a divisão perderia o ida-e-volta após 1 ciclo. 2ª ponta da cópia (a
        // 1ª é o `.select()` de divisoesN acima — sem ele, geo.ida_e_volta seria
        // undefined→false, regressão silenciosa não pega por typecheck). Normaliza
        // liga-only: se o fechamento rebaixou a divisão para grupos, zera (mantém o
        // CHECK league_division_seasons_ida_volta_so_liga).
        ida_e_volta: formato === "liga" ? (geo?.ida_e_volta ?? false) : false,
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

/* -------------------------------------------------------------------------- */
/* Cores do campeonato (change add-cores-campeonato) — UPDATE só do dono       */
/* -------------------------------------------------------------------------- */

export type AtualizarCoresResult = { ok: true } | { ok: false; error: string }

/**
 * Atualiza as cores DEFAULT de uma PIRÂMIDE (`league_competitions`). Autorização
 * por CAPACIDADE GERIR (`podeGerir` = dono ou admin de liga) no app-layer; a RLS
 * (`league_competitions_update_owner` = `pode_gerir_competition`) é o backstop.
 * Cor `undefined`/vazia GRAVA null (limpa); as divisões que não têm cor própria
 * voltam a herdar o tema base do app.
 */
export async function atualizarCoresPiramide(
  competitionId: unknown,
  cores: CoresInput
): Promise<AtualizarCoresResult> {
  const parsedId = z.uuid({ error: "Liga inválida." }).safeParse(competitionId)
  if (!parsedId.success) {
    return { ok: false, error: "Liga inválida." }
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

  // Capacidade GERIR (dono ou admin) por PRÉ-CHECK; a RLS é o backstop.
  if (!(await podeGerir(supabase, { competitionId: parsedId.data }))) {
    return {
      ok: false,
      error: "Campeonato não encontrado ou você não tem acesso a esta ação.",
    }
  }

  const { data: atualizados, error: updateError } = await supabase
    .from("league_competitions")
    .update({
      cor_primaria: parsedCores.data.corPrimaria ?? null,
      cor_secundaria: parsedCores.data.corSecundaria ?? null,
    })
    .eq("id", parsedId.data)
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
      error: "Campeonato não encontrado ou você não tem acesso a esta ação.",
    }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${parsedId.data}/cores`)
  return { ok: true }
}

/**
 * Atualiza as cores de uma DIVISÃO de temporada (`league_division_seasons`).
 * `league_division_seasons` NÃO tem `created_by`: a autorização é TRANSITIVA
 * (`division → season → competition`). Por isso a checagem é em DUAS etapas
 * (PostgREST não filtra UPDATE por coluna de tabela relacionada):
 *   1. SELECT da divisão para descobrir a `competition_id`, seguido do PRÉ-CHECK
 *      de capacidade GERIR (`podeGerir` = dono ou admin) sobre essa competição —
 *      0 linhas/sem acesso = mesma resposta (sem oráculo);
 *   2. UPDATE por id (a autorização já foi provada no passo 1; a RLS é a 2ª
 *      barreira). Cor `undefined`/vazia GRAVA null (limpa) → a divisão volta a
 *      herdar a cor da competição. A cópia da N+1 (`montarProximaTemporada`)
 *      propaga o valor adiante.
 */
export async function atualizarCoresDivisao(
  divisionSeasonId: unknown,
  cores: CoresInput
): Promise<AtualizarCoresResult> {
  const parsedId = z
    .uuid({ error: "Divisão inválida." })
    .safeParse(divisionSeasonId)
  if (!parsedId.success) {
    return { ok: false, error: "Divisão inválida." }
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

  const erroPropriedade =
    "Campeonato não encontrado ou você não tem acesso a esta ação."

  // (1) Descobre a competição da divisão; o pré-check de capacidade GERIR
  // (dono ou admin) abaixo autoriza por capacidade — a RLS é a 2ª barreira.
  const { data: divisao, error: divError } = await supabase
    .from("league_division_seasons")
    .select("id, season_id, league_seasons!inner(competition_id)")
    .eq("id", parsedId.data)
    .maybeSingle()
  if (divError) {
    return {
      ok: false,
      error: "Não foi possível atualizar as cores agora. Tente novamente.",
    }
  }
  if (!divisao) {
    return { ok: false, error: erroPropriedade }
  }

  const competitionId = divisao.league_seasons?.competition_id
  if (!competitionId || !(await podeGerir(supabase, { competitionId }))) {
    return { ok: false, error: erroPropriedade }
  }

  // (2) UPDATE por id (posse já provada acima; RLS é a 2ª barreira).
  const { error: updateError } = await supabase
    .from("league_division_seasons")
    .update({
      cor_primaria: parsedCores.data.corPrimaria ?? null,
      cor_secundaria: parsedCores.data.corSecundaria ?? null,
    })
    .eq("id", parsedId.data)
  if (updateError) {
    return {
      ok: false,
      error: "Não foi possível atualizar as cores agora. Tente novamente.",
    }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${divisao.season_id}`)
  revalidatePath(`/dashboard/ligas/${divisao.season_id}/cores`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* definirListadaLiga — opt-in da vitrine pública (flag na COMPETIÇÃO-mãe)        */
/* -------------------------------------------------------------------------- */

const definirListadaLigaSchema = z.object({
  competitionId: z.string().uuid(),
  /** Só para revalidar a página da temporada corrente. */
  seasonId: z.string().uuid(),
  listada: z.boolean(),
})

/**
 * Liga/desliga a listagem da pirâmide na vitrine pública (change
 * add-vitrine-publica-e-compartilhar). A flag é da COMPETIÇÃO
 * (`league_competitions.listada`), não da season — listar publica a pirâmide
 * inteira. Gateada por `podeGerir` (dono/admin de liga); a escrita é na própria
 * linha (RLS de update do dono já cobre; sem policy nova).
 */
export async function definirListadaLiga(
  input: unknown
): Promise<LeaguePyramidResult> {
  const parsed = definirListadaLigaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Dados inválidos." }
  }
  const { competitionId, seasonId, listada } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  if (!(await podeGerir(supabase, { competitionId }))) {
    return { ok: false, error: "Você não tem permissão para gerir esta liga." }
  }

  try {
    const { error } = await supabase
      .from("league_competitions")
      .update({ listada })
      .eq("id", competitionId)
    if (error) {
      return { ok: false, error: "Não foi possível salvar agora. Tente novamente." }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { action: "definirListadaLiga" } })
    return { ok: false, error: "Não foi possível salvar agora. Tente novamente." }
  }

  revalidatePath("/dashboard/ligas")
  revalidatePath(`/dashboard/ligas/${seasonId}`)
  revalidatePath("/dashboard/explorar")
  return { ok: true }
}
