import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import {
  computeStandings,
  type LinhaClassificacao,
  type TiebreakerPreset,
} from "@/features/standings/computeStandings"
import { rankearAgregadoGrupos } from "@/features/groups/agregadoGrupos"
import type {
  MatchStatus,
  TournamentFormat,
  TournamentStatus,
} from "@/lib/supabase/database.types"

export interface TorneioClassificacao {
  id: string
  titulo: string
  status: TournamentStatus
  /** Formato do torneio — gerado (liga/mata-mata/grupos) habilita painel de início. */
  formato: TournamentFormat
  ida_e_volta: boolean
  /** Disputa de 3º lugar (formatos com chave). */
  terceiro_lugar: boolean
  /** K do formato de grupos (gravado ao iniciar); null nos demais. */
  classificados_por_grupo: number | null
  /** Dono do torneio (anulável: semeados/legados) — habilita o console do dono. */
  created_by: string | null
  pontos_vitoria: number
  pontos_empate: number
  pontos_derrota: number
  /** Preset de desempate (default 'cbf' = comportamento legado). Repassado ao
   * `computeStandings` como 3º arg; sem isto o preset seria ignorado. */
  desempate_criterio: string
}

export interface LinhaComNome extends LinhaClassificacao {
  nome: string
  /** Escudo do clube (competitivo); null no avulso ou clube sem escudo. */
  escudoUrl?: string | null
  /** Foto do participante (avulso); null no competitivo (usa escudo). */
  avatarUrl?: string | null
}

/** Técnico de um lado competitivo — detalhe da UI ("téc. Fulano"). */
export interface TecnicoDoLado {
  id: string
  nome: string | null
}

/** Partida encerrada shaped para o histórico (registro fiel, com fallbacks). */
export interface PartidaEncerrada {
  id: string
  nome_1: string
  nome_2: string
  placar_1: number
  placar_2: number
  /** Aproximação de "encerrada em": último lançamento (`updated_at`). */
  encerradaEm: string
  /** Rodada/fase gerada; null em partida avulsa (sem rótulo na UI). */
  rodada: number | null
  /** Perna do confronto ida-e-volta de chave (1|2); null fora dele. */
  perna: number | null
  /** Grupo da fase de grupos; null fora dela. */
  grupo: number | null
  /** Escudos do clube (competitivo); ausente/null no avulso. Opcionais: o
   * fetcher sempre os preenche, mas fixtures de teste do avulso os omitem. */
  escudo_1?: string | null
  escudo_2?: string | null
  /** Técnico do lado (competitivo) — detalhe; ausente/null no avulso. */
  tecnico_1?: TecnicoDoLado | null
  tecnico_2?: TecnicoDoLado | null
  /** W.O.: a partida foi vitória por walkover (placar 0x0, sem jogo). */
  wo?: boolean
  /** Lado vencedor do W.O. (1 ou 2); null fora de W.O. */
  woVencedorLado?: 1 | 2 | null
}

/** Partida ainda não encerrada — console do dono (encerrar) e contexto. */
export interface PartidaAberta {
  id: string
  nome_1: string
  nome_2: string
  placar_1: number
  placar_2: number
  status: MatchStatus
  /** Rodada/fase gerada; null em partida avulsa (sem rótulo na UI). */
  rodada: number | null
  /** Perna do confronto ida-e-volta de chave (1|2); null fora dele. */
  perna: number | null
  /** Grupo da fase de grupos; null fora dela. */
  grupo: number | null
  /** Lados da partida (id + celular) — insumo do atalho de convocação. No
   * avulso é o PARTICIPANTE; no competitivo é o TÉCNICO da vaga adversária
   * (mesmo gate; só quem joga). A lista é RSC: o celular só vai ao HTML de
   * quem joga a partida. */
  participante_1: { id: string; celular: string | null } | null
  participante_2: { id: string; celular: string | null } | null
  /** Escudos do clube (competitivo); ausente/null no avulso. Opcionais: o
   * fetcher sempre os preenche, mas fixtures de teste do avulso os omitem. */
  escudo_1?: string | null
  escudo_2?: string | null
  /** Técnico do lado (competitivo) — detalhe; ausente/null no avulso. */
  tecnico_1?: TecnicoDoLado | null
  tecnico_2?: TecnicoDoLado | null
  /** Clube órfão (vaga sem técnico) por lado — insumo do W.O. automático na UI. */
  orfao_1?: boolean
  orfao_2?: boolean
  /** Slot id de cada lado (competitivo) — alvo do W.O. do dono; null no avulso. */
  vagaId_1?: string | null
  vagaId_2?: string | null
}

/** Partida da chave de mata-mata (rodada e posicao presentes) — bracket. */
export interface PartidaDaChave {
  id: string
  rodada: number
  posicao: number
  perna: number | null
  /** Id OPACO do lado (user no avulso, SLOT no competitivo) — chave do
   * pareamento de vencedor; o BracketView nunca interpreta o significado. */
  participante_1: string | null
  participante_2: string | null
  nome_1: string
  nome_2: string
  placar_1: number
  placar_2: number
  status: MatchStatus
  /** Escudos do clube (competitivo); ausente/null no avulso. Opcionais: o
   * fetcher sempre os preenche, mas fixtures de teste do avulso os omitem. */
  escudo_1?: string | null
  escudo_2?: string | null
  /** W.O.: a partida da chave foi decidida por walkover (0x0). */
  wo?: boolean
  /** Id OPACO do lado vencedor do W.O. — `decidirConfronto` o lê para decidir
   * o confronto; null fora de W.O. */
  woVencedor?: string | null
}

/** Classificação de UM grupo (formato de grupos/fase de liga). */
export interface GrupoClassificacao {
  grupo: number
  linhas: LinhaComNome[]
}

export interface ClassificacaoTorneio {
  torneio: TorneioClassificacao
  linhas: LinhaComNome[]
  partidasEncerradas: PartidaEncerrada[]
  /** Classificação de clubes: mesmo motor, chaveado por time_1/time_2. */
  clubes: LinhaComNome[]
  partidasAbertas: PartidaAberta[]
  /** Chave eliminatória (vazia fora dos formatos com chave) — MESMO snapshot. */
  chave: PartidaDaChave[]
  /** Classificação POR GRUPO (vazia fora dos formatos de grupos) — idem. */
  grupos: GrupoClassificacao[]
  /**
   * Agregado POSIÇÃO-NO-GRUPO (Fase 5.2): ordem total única de TODOS os
   * competidores da fase de grupos (1ºs de grupo, depois 2ºs…), que DECIDE o
   * sobe/cai numa divisão `grupos_mata_mata`. `undefined` fora de grupos. Os
   * `pontos`/`jogos` por linha são SÓ da fase de grupos (o mata-mata não entra).
   */
  linhasFaseGrupos?: LinhaComNome[]
  /** Rodada ATIVA derivada: menor `rodada` entre as partidas não-encerradas
   * (null = sem partida aberta com rodada, ou avulso). Insumo do botão "Fechar
   * rodada". */
  rodadaAtiva: number | null
}

interface ParticipanteEmbed {
  id: string
  nome: string | null
  /** PII (RLS: só authenticated lê users): consumido APENAS pela projeção
   * de partidas abertas — insumo do atalho de convocação. */
  celular: string | null
  avatar: string | null
}

interface ClubeEmbed {
  id: string
  nome: string
}

/** Vaga embutida na partida competitiva: clube OU rótulo (por nome) + técnico. */
interface VagaEmbed {
  id: string
  rotulo: string | null
  team: { nome: string | null; escudo_url: string | null } | null
  tecnico: { id: string; nome: string | null; celular: string | null } | null
}

interface PartidaComNomes {
  id: string
  participante_1: string | null
  participante_2: string | null
  vaga_1: string | null
  vaga_2: string | null
  time_1: string | null
  time_2: string | null
  placar_1: number
  placar_2: number
  status: MatchStatus
  rodada: number | null
  posicao: number | null
  perna: number | null
  grupo: number | null
  wo: boolean
  wo_vencedor: string | null
  created_at: string
  updated_at: string
  p1: ParticipanteEmbed | null
  p2: ParticipanteEmbed | null
  t1: ClubeEmbed | null
  t2: ClubeEmbed | null
  v1: VagaEmbed | null
  v2: VagaEmbed | null
}

/** Mesmo fallback do MatchCard para participante sem nome. */
function nomeOuFallback(nome: string | null | undefined): string {
  return nome?.trim() || "Sem nome"
}

/**
 * Nome de um LADO do histórico: lado vazio é "A definir" (fallback do
 * MatchCard) — diferente do motor, o histórico REGISTRA a partida como ela é.
 */
function nomeDoLado(embed: ParticipanteEmbed | null): string {
  return embed ? nomeOuFallback(embed.nome) : "A definir"
}

/** Lado COMPETITIVO: o nome é o CLUBE da vaga (ou o RÓTULO, no modo por-nome);
 * vaga vazia (bye/TBD) é "A definir". */
function nomeDaVaga(vaga: VagaEmbed | null): string {
  return vaga ? nomeOuFallback(vaga.team?.nome ?? vaga.rotulo) : "A definir"
}

/**
 * Projeção de UM lado, unificada por formato: no avulso o lado é o
 * PARTICIPANTE (id user); no competitivo é a VAGA (id slot, nome do clube,
 * técnico como detalhe, escudo). `ladoCru` é o id OPACO que o motor consome.
 */
interface LadoProjetado {
  nome: string
  ladoCru: string | null
  escudo: string | null
  tecnico: TecnicoDoLado | null
  /** {id, celular} do lado — insumo da convocação; user no avulso, técnico no
   * competitivo. null quando não há quem chamar. */
  contato: { id: string; celular: string | null } | null
}

function projetarLado(
  vaga: VagaEmbed | null,
  participante: ParticipanteEmbed | null,
  ladoCru: string | null,
  competitivo: boolean
): LadoProjetado {
  if (competitivo) {
    const tecnico = vaga?.tecnico
      ? { id: vaga.tecnico.id, nome: vaga.tecnico.nome }
      : null
    return {
      nome: nomeDaVaga(vaga),
      ladoCru,
      escudo: vaga?.team?.escudo_url ?? null,
      tecnico,
      // Convocação competitiva: o contato é o TÉCNICO da vaga (mesmo gate).
      contato: vaga?.tecnico
        ? { id: vaga.tecnico.id, celular: vaga.tecnico.celular }
        : null,
    }
  }
  return {
    nome: nomeDoLado(participante),
    ladoCru,
    escudo: null,
    tecnico: null,
    contato: participante ? { id: participante.id, celular: participante.celular } : null,
  }
}

/**
 * Busca o torneio (regras de pontuação) e as partidas dele, roda o motor puro
 * e devolve a classificação com nomes resolvidos.
 *
 * - Torneio invisível pela RLS (privado de terceiro) ou inexistente → `null`
 *   (a página converte em notFound; resposta única, sem oráculo de existência).
 * - A query de partidas seleciona a COLUNA `participante_*` (uuid, insumo do
 *   motor) E o embed aliased com o nome (insumo do mapa) — suportado pelo
 *   PostgREST na mesma query, com FK-hint explícito para desambiguar os dois
 *   relacionamentos matches→users (padrão de getActiveMatches).
 * - Se o torneio é visível, a RLS de matches devolve TODAS as partidas dele
 *   (a cláusula de torneio da policy cobre; a de participante só adiciona) —
 *   a classificação nunca é calculada com subconjunto.
 * - `cache()` (React): generateMetadata e a page compartilham o resultado na
 *   MESMA requisição — uma viagem ao banco, não duas.
 */
export const getTournamentClassificacao = cache(async function getTournamentClassificacao(
  tournamentId: string,
  /** Override do preset (testes): substitui `tournaments.desempate_criterio`. */
  tiebreakerOverride?: TiebreakerPreset
): Promise<ClassificacaoTorneio | null> {
  const supabase = await createClient()

  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select(
      "id, titulo, status, formato, ida_e_volta, terceiro_lugar, classificados_por_grupo, created_by, pontos_vitoria, pontos_empate, pontos_derrota, desempate_criterio"
    )
    .eq("id", tournamentId)
    .maybeSingle()

  if (torneioError) {
    throw new Error(`Falha ao carregar o torneio: ${torneioError.message}`)
  }
  if (!torneio) {
    return null
  }

  // Ordenadas por updated_at desc para o histórico (encerradas mais recentes
  // primeiro); o motor é insensível à ordem (acumuladores comutativos).
  // Avulso embeda PARTICIPANTES (p1/p2) + clubes opcionais por partida (t1/t2);
  // competitivo embeda as VAGAS (v1/v2 → clube + técnico) — o motor roda sobre
  // os ids crus (participante_* no avulso, vaga_* no competitivo). As DUAS
  // famílias de embed vêm na mesma query (uma viagem): nos competitivos
  // participante_* são null (CHECK matches_lado_vaga_ou_user), e vice-versa.
  const { data: partidas, error: partidasError } = await supabase
    .from("matches")
    .select(
      `id, participante_1, participante_2, vaga_1, vaga_2, time_1, time_2, placar_1, placar_2, status, rodada, posicao, perna, grupo, wo, wo_vencedor, created_at, updated_at,
       p1:users!matches_participante_1_fkey ( id, nome, celular, avatar ),
       p2:users!matches_participante_2_fkey ( id, nome, celular, avatar ),
       t1:teams!matches_time_1_fkey ( id, nome ),
       t2:teams!matches_time_2_fkey ( id, nome ),
       v1:tournament_slots!matches_vaga_1_fkey ( id, rotulo, team:teams!tournament_slots_team_id_fkey ( nome, escudo_url ), tecnico:users!tournament_slots_user_id_fkey ( id, nome, celular ) ),
       v2:tournament_slots!matches_vaga_2_fkey ( id, rotulo, team:teams!tournament_slots_team_id_fkey ( nome, escudo_url ), tecnico:users!tournament_slots_user_id_fkey ( id, nome, celular ) )`
    )
    .eq("tournament_id", tournamentId)
    .order("updated_at", { ascending: false })

  if (partidasError) {
    throw new Error(`Falha ao carregar as partidas: ${partidasError.message}`)
  }

  // Embeds to-one chegam como objeto único; o tipo explícito é a fonte de
  // verdade nesta fronteira de confiança (mesma decisão de getActiveMatches).
  const linhasPartidas = (partidas ?? []) as unknown as PartidaComNomes[]

  // COMPETITIVO ⇔ formato !== 'avulso': os lados são VAGAS (id slot, nome do
  // clube). O motor roda sobre vaga_1/vaga_2; o nome do lado é o clube; o
  // técnico é detalhe. No avulso o caminho original (participante embeds) fica
  // INTOCADO.
  const competitivo = torneio.formato !== "avulso"
  // Id cru que alimenta o motor: vaga no competitivo, participante no avulso.
  const ladoCru1 = (p: PartidaComNomes) =>
    competitivo ? p.vaga_1 : p.participante_1
  const ladoCru2 = (p: PartidaComNomes) =>
    competitivo ? p.vaga_2 : p.participante_2
  const lado1 = (p: PartidaComNomes) =>
    projetarLado(p.v1, p.p1, ladoCru1(p), competitivo)
  const lado2 = (p: PartidaComNomes) =>
    projetarLado(p.v2, p.p2, ladoCru2(p), competitivo)
  // W.O.: o vencedor é o slot `wo_vencedor` (= vaga_1 ou vaga_2 = ladoCru). O
  // motor ignora o placar 0x0 e credita só os pontos. No avulso wo é sempre
  // false (formato não recebe W.O.).
  const woVencedor = (p: PartidaComNomes) => (p.wo ? p.wo_vencedor : null)
  // Linhas do motor: re-chaveadas pelo id cru do lado conforme o formato.
  const linhasMotor = linhasPartidas.map((p) => ({
    participante_1: ladoCru1(p),
    participante_2: ladoCru2(p),
    placar_1: p.placar_1,
    placar_2: p.placar_2,
    status: p.status,
    woVencedor: woVencedor(p),
  }))

  // Mapa id-do-lado → nome: no avulso é o participante; no competitivo é o
  // CLUBE da vaga (chaveado pelo SLOT id, que o motor usa como lado). Escudo
  // só no competitivo (insumo do StandingsTable).
  const nomes = new Map<string, string>()
  const escudos = new Map<string, string | null>()
  const nomesClubes = new Map<string, string>()
  // Foto do participante (só avulso): chaveada pelo id do participante.
  const avatares = new Map<string, string | null>()
  for (const p of linhasPartidas) {
    if (competitivo) {
      if (p.v1) {
        nomes.set(p.v1.id, nomeOuFallback(p.v1.team?.nome ?? p.v1.rotulo))
        escudos.set(p.v1.id, p.v1.team?.escudo_url ?? null)
      }
      if (p.v2) {
        nomes.set(p.v2.id, nomeOuFallback(p.v2.team?.nome ?? p.v2.rotulo))
        escudos.set(p.v2.id, p.v2.team?.escudo_url ?? null)
      }
    } else {
      if (p.p1) {
        nomes.set(p.p1.id, nomeOuFallback(p.p1.nome))
        avatares.set(p.p1.id, p.p1.avatar ?? null)
      }
      if (p.p2) {
        nomes.set(p.p2.id, nomeOuFallback(p.p2.nome))
        avatares.set(p.p2.id, p.p2.avatar ?? null)
      }
      if (p.t1) nomesClubes.set(p.t1.id, nomeOuFallback(p.t1.nome))
      if (p.t2) nomesClubes.set(p.t2.id, nomeOuFallback(p.t2.nome))
    }
  }

  const regras = {
    vitoria: torneio.pontos_vitoria,
    empate: torneio.pontos_empate,
    derrota: torneio.pontos_derrota,
  }

  // Preset de desempate da divisão/torneio. Sem repassar aos 3 call-sites do
  // motor o preset seria silenciosamente ignorado (a coluna existiria mas o
  // motor rodaria sempre CBF). Override é insumo de teste. A coluna é NOT NULL
  // com CHECK no banco; `obterTiebreakerSpec` degrada qualquer valor inesperado
  // para CBF (default do switch) — sem necessidade de fallback aqui.
  const desempate: TiebreakerPreset =
    tiebreakerOverride ?? (torneio.desempate_criterio as TiebreakerPreset)

  const linhas = computeStandings(regras, linhasMotor, desempate).map((linha) => ({
    ...linha,
    nome: nomes.get(linha.participanteId) ?? "Sem nome",
    escudoUrl: escudos.get(linha.participanteId) ?? null,
    avatarUrl: competitivo ? null : (avatares.get(linha.participanteId) ?? null),
  }))

  // Projeção `clubes`: recurso do AVULSO (re-chavear partidas avulsas por
  // time_1/time_2 produz a classificação de clubes daquele formato). No
  // COMPETITIVO o lado JÁ É o clube — `linhas` é a classificação de clubes;
  // aqui fica VAZIA (a página não exibe a seção redundante). Avulso intocado:
  // partida sem os dois clubes vira lado nulo → inelegível.
  const clubes = competitivo
    ? []
    : computeStandings(
        regras,
        linhasPartidas.map((p) => ({
          participante_1: p.time_1,
          participante_2: p.time_2,
          placar_1: p.placar_1,
          placar_2: p.placar_2,
          status: p.status,
        })),
        desempate
      ).map((linha) => ({
        ...linha,
        nome: nomesClubes.get(linha.participanteId) ?? "Sem nome",
      }))

  // Bye de chave (mata-mata): partida com slot e um lado vazio — avanço
  // direto, não um jogo. Fica FORA do histórico e das abertas ("João 0 x 0
  // A definir" seria ruído); a chave (BracketView) o exibe como avanço.
  // `typeof === "number"` (e não `!== null`): nesta fronteira de cast um
  // shape sem a coluna viraria bye silenciosamente. O lado vazio é avaliado
  // pelo id CRU do formato (vaga_2 null no competitivo; participante_2 null
  // no avulso) — o bye da chave gerada por vagas é `vaga_2 = null`.
  const ehByeDeChave = (p: PartidaComNomes) =>
    typeof p.posicao === "number" &&
    (ladoCru1(p) === null || ladoCru2(p) === null)

  // Lado vencedor do W.O. (1|2) comparando o slot vencedor com o id cru de
  // cada lado; null fora de W.O. (insumo do rótulo "W.O." na UI).
  const woLado = (p: PartidaComNomes): 1 | 2 | null =>
    !p.wo
      ? null
      : p.wo_vencedor === ladoCru1(p)
        ? 1
        : p.wo_vencedor === ladoCru2(p)
          ? 2
          : null

  // Clube ÓRFÃO de um lado (só competitivo): a vaga existe mas sem técnico.
  // Insumo da UI de fechamento de rodada (qual partida aberta vira W.O.). Só
  // vaga de CLUBE sem técnico é "vaga aberta" (órfã, candidata a W.O.); vaga
  // por NOME (team null + rótulo) NUNCA tem técnico por design — não é "aberta",
  // é competidor fixo (o dono lança o placar).
  const orfao = (vaga: VagaEmbed | null | undefined) =>
    competitivo && vaga != null && vaga.team != null && vaga.tecnico === null

  // Segunda projeção do MESMO snapshot: o histórico registra toda encerrada
  // (inclusive sem participante — diferente do motor, que exige os dois lados).
  // Lado unificado por formato (clube+técnico+escudo no competitivo).
  const partidasEncerradas = linhasPartidas
    .filter((p) => p.status === "encerrada" && !ehByeDeChave(p))
    .map((p) => {
      const l1 = lado1(p)
      const l2 = lado2(p)
      return {
        id: p.id,
        nome_1: l1.nome,
        nome_2: l2.nome,
        placar_1: p.placar_1,
        placar_2: p.placar_2,
        encerradaEm: p.updated_at,
        rodada: p.rodada,
        perna: p.perna,
        grupo: p.grupo,
        escudo_1: l1.escudo,
        escudo_2: l2.escudo,
        tecnico_1: l1.tecnico,
        tecnico_2: l2.tecnico,
        wo: p.wo,
        woVencedorLado: woLado(p),
      }
    })

  // Quarta projeção: em aberto (console do dono — encerrar). `!==` falha-segura:
  // status novo aparece como "em aberto" em vez de sumir. Ordem: RODADA asc
  // primeiro (ordem natural de disputa da liga; null = avulsa, fica depois),
  // slot/perna em seguida (chave do mata-mata em ordem de disputa) e
  // created_at ASC como desempate ESTÁVEL — a query ordena por updated_at
  // (pensada pro histórico) e reordenaria as abertas a cada lançamento de
  // placar (mesma decisão do dashboard em getActiveMatches).
  const partidasAbertas = linhasPartidas
    .filter((p) => p.status !== "encerrada" && !ehByeDeChave(p))
    .sort((a, b) => {
      if (a.rodada !== b.rodada) {
        if (a.rodada === null) return 1
        if (b.rodada === null) return -1
        return a.rodada - b.rodada
      }
      if (a.posicao !== b.posicao) {
        return (a.posicao ?? 0) - (b.posicao ?? 0)
      }
      if (a.perna !== b.perna) {
        return (a.perna ?? 0) - (b.perna ?? 0)
      }
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
    })
    .map((p) => {
      const l1 = lado1(p)
      const l2 = lado2(p)
      return {
        id: p.id,
        nome_1: l1.nome,
        nome_2: l2.nome,
        placar_1: p.placar_1,
        placar_2: p.placar_2,
        status: p.status,
        rodada: p.rodada,
        perna: p.perna,
        grupo: p.grupo,
        // Contato da convocação: participante no avulso, técnico da vaga no
        // competitivo (mesmo gate). A lista é RSC — o celular só vai ao HTML
        // de quem joga (OpenMatchesList compara o id).
        participante_1: l1.contato,
        participante_2: l2.contato,
        escudo_1: l1.escudo,
        escudo_2: l2.escudo,
        tecnico_1: l1.tecnico,
        tecnico_2: l2.tecnico,
        orfao_1: orfao(p.v1),
        orfao_2: orfao(p.v2),
        // Slot id de cada lado (competitivo) — null no avulso (ladoCru = user).
        vagaId_1: competitivo ? p.vaga_1 : null,
        vagaId_2: competitivo ? p.vaga_2 : null,
      }
    })

  // Quinta projeção: a CHAVE do mata-mata (partidas com rodada e slot) —
  // insumo do BracketView. Vazia fora do mata-mata (nenhuma partida tem slot).
  // participante_1/2 é o id CRU do lado (slot no competitivo) — o BracketView
  // pareia vencedor por esse id sem interpretar o significado.
  const chave = linhasPartidas
    .filter(
      (p): p is PartidaComNomes & { rodada: number; posicao: number } =>
        typeof p.rodada === "number" && typeof p.posicao === "number"
    )
    .map((p) => {
      const l1 = lado1(p)
      const l2 = lado2(p)
      return {
        id: p.id,
        rodada: p.rodada,
        posicao: p.posicao,
        perna: p.perna,
        participante_1: ladoCru1(p),
        participante_2: ladoCru2(p),
        nome_1: l1.nome,
        nome_2: l2.nome,
        placar_1: p.placar_1,
        placar_2: p.placar_2,
        status: p.status,
        escudo_1: l1.escudo,
        escudo_2: l2.escudo,
        wo: p.wo,
        // Id cru do vencedor (slot no competitivo) — decidirConfronto o usa.
        woVencedor: woVencedor(p),
      }
    })
    .sort(
      (a, b) =>
        a.rodada - b.rodada || a.posicao - b.posicao || (a.perna ?? 0) - (b.perna ?? 0)
    )

  // Sexta projeção: classificação POR GRUPO (formatos de grupos/fase de
  // liga) — o motor roda sobre o SUBCONJUNTO de cada grupo, mesma mecânica
  // da classificação geral (re-chaveado pelo id cru do lado conforme o
  // formato: vaga no competitivo, participante no avulso).
  const numerosDeGrupo = [
    ...new Set(
      linhasPartidas
        .map((p) => p.grupo)
        .filter((g): g is number => typeof g === "number")
    ),
  ].sort((a, b) => a - b)
  const grupos = numerosDeGrupo.map((grupo) => ({
    grupo,
    linhas: computeStandings(
      regras,
      linhasPartidas
        .filter((p) => p.grupo === grupo)
        .map((p) => ({
          participante_1: ladoCru1(p),
          participante_2: ladoCru2(p),
          placar_1: p.placar_1,
          placar_2: p.placar_2,
          status: p.status,
          woVencedor: woVencedor(p),
        })),
      desempate
    ).map((linha) => ({
      ...linha,
      nome: nomes.get(linha.participanteId) ?? "Sem nome",
      escudoUrl: escudos.get(linha.participanteId) ?? null,
    })),
  }))

  // Agregado POSIÇÃO-NO-GRUPO (Fase 5.2): ordem total única que DECIDE o sobe/cai
  // numa divisão grupos+mata-mata. Roda SÓ sobre as linhas dos grupos (o mata-mata
  // tem `grupo` null → fora de `grupos[]`), então pontos/jogos/posição nunca somam
  // a chave. `undefined` fora dos formatos de grupos (consumidores usam `?? linhas`).
  const linhasFaseGrupos =
    grupos.length > 0 ? rankearAgregadoGrupos(grupos.map((g) => g.linhas)) : undefined

  // Rodada ATIVA derivada: menor rodada entre as partidas não-encerradas com
  // rodada preenchida (competitivo). null se não há aberta com rodada.
  const rodadasAbertas = linhasPartidas
    .filter((p) => p.status !== "encerrada" && typeof p.rodada === "number")
    .map((p) => p.rodada as number)
  const rodadaAtiva = rodadasAbertas.length > 0 ? Math.min(...rodadasAbertas) : null

  return {
    torneio,
    linhas,
    partidasEncerradas,
    clubes,
    partidasAbertas,
    chave,
    grupos,
    linhasFaseGrupos,
    rodadaAtiva,
  }
})
