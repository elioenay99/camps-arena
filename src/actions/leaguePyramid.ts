"use server"

import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { iniciarTorneio } from "@/actions/tournaments"
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"
import {
  createCompetitionSchema,
  DIVISAO_MAX_TAMANHO,
  DIVISAO_MIN_TAMANHO,
  type CreateCompetitionInput,
} from "@/schema/leaguePyramidSchema"

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
/* LÓGICA PURA (testável sem banco) — sobe/cai, sorteio, conservação           */
/* -------------------------------------------------------------------------- */

/** Destino de um competidor após o fluxo de uma temporada. */
export type Destino = "sobe" | "cai" | "permanece"

/** Como o destino foi decidido (motivo, NÃO um quarto destino). */
export type ResolvidoPor = "classificacao" | "playoff" | "sorteio" | "override"

/**
 * Uma linha já classificada de uma divisão, no formato mínimo que o cálculo de
 * fluxo precisa. `ppg` é derivado (pontos por jogo) — desempata divisões de
 * tamanhos diferentes na base 'ppg'. `posicao` vem do motor (empatados dividem).
 */
export interface LinhaFluxo {
  competitorId: string
  posicao: number
  pontos: number
  jogos: number
}

/** Resultado por competidor no PLANO de fluxo (sem escrita). */
export interface ItemPlanoFluxo {
  competitorId: string
  /** Nível em que jogou nesta temporada (1 = topo). */
  nivelOrigem: number
  /** Nível para onde vai na próxima temporada. */
  nivelDestino: number
  posicaoFinal: number
  pontos: number
  jogos: number
  destino: Destino
  resolvidoPor: ResolvidoPor
}

/** Fronteira entre a divisão `nivelSuperior` (d) e a de baixo (d+1). */
export interface FronteiraFluxo {
  nivelSuperior: number
  vagasAcesso: number
  vagasRebaixamento: number
}

/** Uma divisão pronta para o cálculo: nível + suas linhas classificadas. */
export interface DivisaoFluxo {
  nivel: number
  /** Já ordenadas por posição ascendente (1º primeiro). */
  linhas: LinhaFluxo[]
}

/** PLANO completo (read-only) de um fluxo de temporada. */
export interface PlanoFluxoTemporada {
  /** Itens por competidor (todos os de todas as divisões). */
  itens: ItemPlanoFluxo[]
  /** Semente crypto usada nos sorteios (auditável/reproduzível). */
  seed: string
}

/**
 * PRNG determinístico semeado por uma string (mulberry32 sobre um hash FNV-1a
 * da semente). Mesma semente ⇒ mesma sequência ⇒ mesma ordem sorteada. Crypto
 * NÃO serve aqui (não é reproduzível); a semente em si É gerada por crypto
 * (`crypto.randomUUID`) e gravada para auditoria — a aleatoriedade é
 * criptográfica na ESCOLHA da semente, e o sorteio a partir dela é
 * determinístico (auditável/reexecutável).
 */
export function prngDeSemente(seed: string): () => number {
  // FNV-1a 32 bits da semente → estado inicial do mulberry32.
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let estado = h >>> 0
  return function () {
    estado |= 0
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Embaralha (Fisher-Yates) uma cópia de `itens` com um PRNG determinístico
 * semeado por `seed`. Mesma semente + mesma entrada ⇒ mesma saída.
 */
export function ordemSorteada<T>(itens: readonly T[], seed: string): T[] {
  const arr = [...itens]
  const rng = prngDeSemente(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Resolve QUAIS linhas ocupam as `vagas` da ponta indicada (`top` = primeiras
 * posições = quem SOBE; `bottom` = últimas = quem CAI), tratando o empate EXATO
 * na zona de corte por sorteio determinístico.
 *
 * Retorna os `competitorId` escolhidos + o conjunto dos que foram decididos por
 * sorteio (corte caiu no meio de um grupo de empatados pela `posicao`).
 *
 * `linhas` deve vir ordenada por posição ascendente. `seedBase` semeia o PRNG
 * (combinado com o nível+ponta para sorteios independentes por fronteira).
 */
export function resolverZonaDeCorte(
  linhas: readonly LinhaFluxo[],
  vagas: number,
  ponta: "top" | "bottom",
  seedBase: string
): { escolhidos: Set<string>; sorteados: Set<string> } {
  const escolhidos = new Set<string>()
  const sorteados = new Set<string>()
  if (vagas <= 0 || linhas.length === 0) return { escolhidos, sorteados }
  if (vagas >= linhas.length) {
    // A zona engole a divisão inteira — todos entram, nada a sortear.
    for (const l of linhas) escolhidos.add(l.competitorId)
    return { escolhidos, sorteados }
  }

  // Ordena pela "distância da ponta": top usa posição ascendente; bottom usa a
  // posição DESCENDENTE (os últimos primeiro). O sorteio só age no grupo que
  // CRUZA a linha de corte.
  const ordenadas =
    ponta === "top"
      ? [...linhas].sort((a, b) => a.posicao - b.posicao)
      : [...linhas].sort((a, b) => b.posicao - a.posicao)

  // Os que estão claramente DENTRO (antes do grupo de corte) e o grupo de corte.
  const dentro: LinhaFluxo[] = []
  for (let i = 0; i < vagas; i++) dentro.push(ordenadas[i])

  // Posição na fronteira (a do último que entra direto). Todos os empatados nessa
  // posição (de ambos os lados do corte) disputam as vagas restantes por sorteio.
  const posCorte = ordenadas[vagas - 1].posicao
  const grupoCorte = ordenadas.filter((l) => l.posicao === posCorte)

  if (grupoCorte.length <= 1) {
    // Sem empate na linha de corte: os `vagas` primeiros entram, sem sorteio.
    for (const l of dentro) escolhidos.add(l.competitorId)
    return { escolhidos, sorteados }
  }

  // Empate na zona de corte: os que estão ANTES do grupo entram direto; o grupo
  // de empatados é sorteado para preencher as vagas restantes.
  const antesDoGrupo = ordenadas
    .slice(0, vagas)
    .filter((l) => l.posicao !== posCorte)
  for (const l of antesDoGrupo) escolhidos.add(l.competitorId)

  const vagasRestantes = vagas - antesDoGrupo.length
  // Semente independente por fronteira+ponta (sorteios não se contaminam).
  const seed = `${seedBase}:${ponta}:${posCorte}`
  const sorteada = ordemSorteada(grupoCorte, seed)
  for (let i = 0; i < vagasRestantes; i++) {
    escolhidos.add(sorteada[i].competitorId)
    sorteados.add(sorteada[i].competitorId)
  }
  return { escolhidos, sorteados }
}

/**
 * Calcula o PLANO de fluxo (read-only) a partir das divisões classificadas e
 * das fronteiras `direto`. Para cada fronteira d↔d+1:
 *   - os `vagasRebaixamento` ÚLTIMOS da divisão d CAEM;
 *   - os `vagasAcesso` PRIMEIROS da divisão d+1 SOBEM.
 * Empate exato na linha de corte → sorteio determinístico (`seed`). Função PURA
 * (sem banco) — o coração testável de `calcularFluxoTemporada`.
 */
export function calcularPlanoFluxo(
  divisoes: readonly DivisaoFluxo[],
  fronteiras: readonly FronteiraFluxo[],
  seed: string
): PlanoFluxoTemporada {
  const porNivel = new Map<number, DivisaoFluxo>()
  for (const d of divisoes) porNivel.set(d.nivel, d)

  // Conjuntos de quem sobe/cai (e quem por sorteio), por nível.
  const sobeDe = new Map<number, Set<string>>()
  const caiDe = new Map<number, Set<string>>()
  const sorteadosGlobal = new Set<string>()

  for (const f of fronteiras) {
    const sup = porNivel.get(f.nivelSuperior)
    const inf = porNivel.get(f.nivelSuperior + 1)
    if (!sup || !inf) continue

    // CAEM da superior: as últimas `vagasRebaixamento` posições.
    const queda = resolverZonaDeCorte(
      sup.linhas,
      f.vagasRebaixamento,
      "bottom",
      `${seed}:cai:${f.nivelSuperior}`
    )
    caiDe.set(sup.nivel, queda.escolhidos)
    for (const id of queda.sorteados) sorteadosGlobal.add(id)

    // SOBEM da inferior: as primeiras `vagasAcesso` posições.
    const acesso = resolverZonaDeCorte(
      inf.linhas,
      f.vagasAcesso,
      "top",
      `${seed}:sobe:${f.nivelSuperior}`
    )
    sobeDe.set(inf.nivel, acesso.escolhidos)
    for (const id of acesso.sorteados) sorteadosGlobal.add(id)
  }

  const itens: ItemPlanoFluxo[] = []
  for (const div of divisoes) {
    const sobe = sobeDe.get(div.nivel) ?? new Set<string>()
    const cai = caiDe.get(div.nivel) ?? new Set<string>()
    for (const linha of div.linhas) {
      let destino: Destino = "permanece"
      let nivelDestino = div.nivel
      if (cai.has(linha.competitorId)) {
        destino = "cai"
        nivelDestino = div.nivel + 1
      } else if (sobe.has(linha.competitorId)) {
        destino = "sobe"
        nivelDestino = div.nivel - 1
      }
      itens.push({
        competitorId: linha.competitorId,
        nivelOrigem: div.nivel,
        nivelDestino,
        posicaoFinal: linha.posicao,
        pontos: linha.pontos,
        jogos: linha.jogos,
        destino,
        resolvidoPor: sorteadosGlobal.has(linha.competitorId)
          ? "sorteio"
          : "classificacao",
      })
    }
  }

  return { itens, seed }
}

/**
 * Valida a CONSERVAÇÃO de tamanho ao montar a próxima temporada a partir do
 * plano: para cada divisão, o tamanho resultante = entrantes (permanece +
 * recebidos de cima + recebidos de baixo). REJEITA (retorna o nível ofensor) se
 * alguma divisão sair de [2,20]. Função PURA — espelha o CHECK de fechamento do
 * banco (design §7.1) e roda ANTES de qualquer escrita.
 */
export function validarFechamentoTamanho(itens: readonly ItemPlanoFluxo[]): {
  ok: true
  tamanhos: Map<number, number>
} | {
  ok: false
  nivel: number
  tamanho: number
} {
  const tamanhos = new Map<number, number>()
  for (const it of itens) {
    tamanhos.set(it.nivelDestino, (tamanhos.get(it.nivelDestino) ?? 0) + 1)
  }
  for (const [nivel, tamanho] of [...tamanhos.entries()].sort((a, b) => a[0] - b[0])) {
    if (tamanho < DIVISAO_MIN_TAMANHO || tamanho > DIVISAO_MAX_TAMANHO) {
      return { ok: false, nivel, tamanho }
    }
  }
  return { ok: true, tamanhos }
}

/* -------------------------------------------------------------------------- */
/* createCompetition — cria a pirâmide + temporada 1 (rascunho) + competidores */
/* -------------------------------------------------------------------------- */

/** Discrimina competidor por nome (tem `rotulo`) vs. clube (tem `teamId`). */
function temRotulo(
  c: CreateCompetitionInput["divisoes"][number]["competidores"][number]
): c is { rotulo: string; holderUserId?: string } {
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
      if (temRotulo(c)) {
        linhasCompetidores.push({
          competition_id: competitionId,
          team_id: null,
          rotulo: c.rotulo,
          holder_user_id: c.holderUserId ?? null,
          _nivel: div.nivel,
        })
      } else {
        linhasCompetidores.push({
          competition_id: competitionId,
          team_id: c.teamId,
          rotulo: null,
          holder_user_id: c.holderUserId ?? null,
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
/* calcularFluxoTemporada — READ-ONLY: deriva o PLANO de sobe/cai               */
/* -------------------------------------------------------------------------- */

export type CalcularFluxoResult =
  | { ok: true; plano: PlanoFluxoTemporada }
  | { ok: false; error: string }

/**
 * Calcula (sem escrever) o PLANO de fluxo de uma temporada: lê a classificação
 * de cada divisão via `getTournamentClassificacao`, mapeia slot → competidor,
 * deriva posição/PPG e aplica as fronteiras `direto` (N últimos caem / N
 * primeiros sobem), sorteando o empate exato na zona de corte com semente crypto
 * (auditável). Retorna o plano para a tela de fluxo (2 cliques: calcular →
 * confirmar). Posse por FILTRO transitivo + RLS.
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
    .select("id, nivel, tournament_id")
    .eq("season_id", parsed.data)
    .order("nivel")
  if (divsError || !divisoes || divisoes.length === 0) {
    return { ok: false, error: erroGenerico }
  }

  const { data: fronteiras, error: frontError } = await supabase
    .from("league_boundaries")
    .select("nivel_superior, vagas_acesso, vagas_rebaixamento")
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

    const linhas: LinhaFluxo[] = []
    for (const linha of classificacao.linhas) {
      // `participanteId` no competitivo É o slot id.
      const competitorId = competitorPorSlot.get(linha.participanteId)
      if (!competitorId) {
        // Slot sem competidor mapeado: divisão fora do trilho da pirâmide.
        return { ok: false, error: erroGenerico }
      }
      linhas.push({
        competitorId,
        posicao: linha.posicao,
        pontos: linha.pontos,
        jogos: linha.jogos,
      })
    }
    divisoesFluxo.push({ nivel: div.nivel, linhas })
  }

  // Semente crypto: a ESCOLHA é criptográfica (auditável/gravável); o sorteio a
  // partir dela é determinístico (reexecutável com a mesma semente).
  const seed = crypto.randomUUID()
  const plano = calcularPlanoFluxo(
    divisoesFluxo,
    (fronteiras ?? []).map((f) => ({
      nivelSuperior: f.nivel_superior,
      vagasAcesso: f.vagas_acesso,
      vagasRebaixamento: f.vagas_rebaixamento,
    })),
    seed
  )

  return { ok: true, plano }
}

/* -------------------------------------------------------------------------- */
/* confirmarFluxoTemporada — ESCRITA idempotente: persiste entries + monta N+1  */
/* -------------------------------------------------------------------------- */

/** Ajuste manual do dono sobre o plano sorteado (override do empate). */
export interface AjusteFluxo {
  competitorId: string
  destino: Destino
  nivelDestino: number
}

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

  // Recalcula o plano (posse já conferida lá dentro por FILTRO).
  const calc = await calcularFluxoTemporada(parsed.data)
  if (!calc.ok) {
    return { ok: false, error: calc.error }
  }

  // Aplica os ajustes do dono (override do empate) sobre o plano recalculado.
  const ajustePorCompetidor = new Map<string, AjusteFluxo>()
  for (const a of ajustes ?? []) ajustePorCompetidor.set(a.competitorId, a)

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

  // VALIDA o fechamento de tamanho ANTES de qualquer escrita (rejeita config que
  // deixaria divisão fora de [2,20]).
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
    .select("nivel, nome, por_nome, desempate")
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
