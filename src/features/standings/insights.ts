import type {
  LinhaClassificacao,
  PartidaClassificavel,
} from "@/features/standings/computeStandings"

/**
 * Camada de INSIGHTS derivada de `matches` — forma recente, destaques automáticos
 * e confronto direto histórico. PURA (sem IO), no estilo de `computeStandings`.
 * As três funções espelham a creditação de `aplicarPartida` (W.O./duplo W.O.) —
 * mesma fonte de verdade do motor.
 */

/** Recorte de partida COM a chave de ordenação cronológica (o motor é comutativo
 * e não a carrega; forma/sequências/confronto precisam de ordem). */
export interface PartidaCronologica extends PartidaClassificavel {
  /** Rodada de disputa (liga); `null` no avulso. */
  rodada: number | null
  /** `matches.created_at` (ISO) — ordem de disputa estável. */
  criadaEm: string
  /** `matches.id` — desempate final determinístico. */
  id: string
}

type PartidaCronoElegivel = PartidaCronologica & {
  participante_1: string
  participante_2: string
}

/** Mesma elegibilidade de `computeStandings` (encerrada, dois lados, distintos). */
function ehElegivel(p: PartidaCronologica): p is PartidaCronoElegivel {
  return (
    p.status === "encerrada" &&
    p.participante_1 !== null &&
    p.participante_2 !== null &&
    p.participante_1 !== p.participante_2
  )
}

/**
 * Ordem cronológica para COMPETIÇÃO ÚNICA (torneio/divisão): rodada asc (`null`
 * por último), depois `criadaEm` asc, `id` asc. MESMO PRINCÍPIO da lista de
 * partidas abertas (não idêntico — aquela usa rodada→posicao→perna→created_at,
 * sem id).
 */
export function ordenarCronologico(
  a: PartidaCronologica,
  b: PartidaCronologica
): number {
  if (a.rodada !== b.rodada) {
    if (a.rodada === null) return 1
    if (b.rodada === null) return -1
    return a.rodada - b.rodada
  }
  if (a.criadaEm !== b.criadaEm) return a.criadaEm < b.criadaEm ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Ordem cronológica para CARREIRA (cross-competição): `criadaEm` asc → `id` asc,
 * SEM rodada-first. A rodada é numerada POR competição; ordenar por rodada global
 * misturaria cronologias (rodada 1 da temporada 3 antes da rodada 38 da 1).
 */
export function ordenarPorData(
  a: PartidaCronologica,
  b: PartidaCronologica
): number {
  if (a.criadaEm !== b.criadaEm) return a.criadaEm < b.criadaEm ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

type Resultado = "V" | "E" | "D"

export interface ResultadoLado {
  resultado: Resultado
  /** W.O. simples OU duplo W.O. (sem jogo real). */
  wo: boolean
  /** Não sofreu gol num JOGO REAL (0x0 real conta; W.O. NÃO). */
  cleanSheet: boolean
}

/**
 * Resultado de UM lado de uma partida elegível, espelhando `aplicarPartida` na
 * ORDEM `woDuplo → woVencedor → placar`. `cleanSheet` só é `true` no ramo de
 * placar (jogo real) quando o lado não sofreu gol — inclui o 0x0 real, exclui
 * W.O. (0x0 sem jogo). Exportada para reuso pela campanha do técnico
 * (`coachStats`), que não pode reimplementar a regra de W.O.
 */
export function resultadoDoLado(p: PartidaCronoElegivel, lado: 1 | 2): ResultadoLado {
  if (p.woDuplo) {
    return { resultado: "D", wo: true, cleanSheet: false }
  }
  if (p.woVencedor != null) {
    const idDoLado = lado === 1 ? p.participante_1 : p.participante_2
    return {
      resultado: p.woVencedor === idDoLado ? "V" : "D",
      wo: true,
      cleanSheet: false,
    }
  }
  const meu = lado === 1 ? p.placar_1 : p.placar_2
  const dele = lado === 1 ? p.placar_2 : p.placar_1
  const resultado: Resultado = meu > dele ? "V" : meu < dele ? "D" : "E"
  return { resultado, wo: false, cleanSheet: dele === 0 }
}

// ── Forma (últimos 5) ───────────────────────────────────────────────────────

export type ResultadoForma = Resultado

export interface ItemForma {
  resultado: ResultadoForma
  /** Foi W.O./duplo W.O. (a UI pode marcar o badge). */
  wo: boolean
  rodada: number | null
}

/**
 * Por participante (id OPACO — slot no competitivo, user no avulso), a lista
 * CRONOLÓGICA asc de resultados. A UI fatia os últimos 5. Participante sem jogo
 * elegível não aparece no Map.
 */
export function calcularForma(
  partidas: PartidaCronologica[],
  ordenar: (a: PartidaCronologica, b: PartidaCronologica) => number = ordenarCronologico
): Map<string, ItemForma[]> {
  const elegiveis = partidas.filter(ehElegivel).sort(ordenar)
  const forma = new Map<string, ItemForma[]>()
  const empurrar = (id: string, item: ItemForma) => {
    const arr = forma.get(id)
    if (arr) arr.push(item)
    else forma.set(id, [item])
  }
  for (const p of elegiveis) {
    const r1 = resultadoDoLado(p, 1)
    const r2 = resultadoDoLado(p, 2)
    empurrar(p.participante_1, { resultado: r1.resultado, wo: r1.wo, rodada: p.rodada })
    empurrar(p.participante_2, { resultado: r2.resultado, wo: r2.wo, rodada: p.rodada })
  }
  return forma
}

// ── Destaques (torneio/divisão — relativos) ─────────────────────────────────

export interface DestaqueParticipante {
  participanteId: string
  valor: number
}

export interface Goleada {
  vencedorId: string
  perdedorId: string
  placarVencedor: number
  placarPerdedor: number
  diferenca: number
  rodada: number | null
  matchId: string
}

export interface SequenciaParticipante {
  participanteId: string
  extensao: number
}

export interface Destaques {
  melhorAtaque: DestaqueParticipante | null
  melhorDefesa: DestaqueParticipante | null
  maiorGoleada: Goleada | null
  maiorInvencibilidade: SequenciaParticipante | null
  maiorSequenciaVitorias: SequenciaParticipante | null
  maiorSequenciaCleanSheets: SequenciaParticipante | null
  mediaGolsPorJogo: number
}

/** Sequência de resultado por participante (V/E/D + clean sheet), ordenada. */
interface ItemSequencia {
  resultado: Resultado
  cleanSheet: boolean
}

/** Constrói a sequência ordenada de resultados por participante. */
function sequenciasPorParticipante(
  elegiveis: PartidaCronoElegivel[]
): Map<string, ItemSequencia[]> {
  const seq = new Map<string, ItemSequencia[]>()
  const empurrar = (id: string, item: ItemSequencia) => {
    const arr = seq.get(id)
    if (arr) arr.push(item)
    else seq.set(id, [item])
  }
  for (const p of elegiveis) {
    const r1 = resultadoDoLado(p, 1)
    const r2 = resultadoDoLado(p, 2)
    empurrar(p.participante_1, { resultado: r1.resultado, cleanSheet: r1.cleanSheet })
    empurrar(p.participante_2, { resultado: r2.resultado, cleanSheet: r2.cleanSheet })
  }
  return seq
}

/**
 * Maior run em que `condicao` é verdadeira, por participante. Empate de extensão
 * → menor id (iteração em ordem de chave ascendente + comparação estrita).
 */
function maiorSequencia(
  seq: Map<string, ItemSequencia[]>,
  condicao: (i: ItemSequencia) => boolean
): SequenciaParticipante | null {
  let melhor: SequenciaParticipante | null = null
  const ids = [...seq.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const id of ids) {
    let run = 0
    let maxRun = 0
    for (const item of seq.get(id)!) {
      if (condicao(item)) {
        run += 1
        if (run > maxRun) maxRun = run
      } else {
        run = 0
      }
    }
    if (maxRun > 0 && (melhor === null || maxRun > melhor.extensao)) {
      melhor = { participanteId: id, extensao: maxRun }
    }
  }
  return melhor
}

/**
 * Destaques de uma competição de pontos corridos. `linhas` já vem ordenada e
 * chaveada como a UI exibe (slot no competitivo). Melhor ataque/defesa saem da
 * TABELA (GP/GC incluem os 0 de W.O., como o usuário já lê — distorção de
 * "W.O.-farming" aceita); goleada/clean sheet/média excluem W.O.
 */
export function calcularDestaques(
  linhas: LinhaClassificacao[],
  partidas: PartidaCronologica[]
): Destaques {
  const elegiveis = partidas.filter(ehElegivel)

  // Melhor ataque/defesa: só linhas que jogaram (jogos > 0). `linhas` já ordenada
  // (empate → melhor posição vence pela ordem). Ataque null se ninguém marcou.
  const jogaram = linhas.filter((l) => l.jogos > 0)
  let melhorAtaque: DestaqueParticipante | null = null
  let melhorDefesa: DestaqueParticipante | null = null
  for (const l of jogaram) {
    if (melhorAtaque === null || l.golsPro > melhorAtaque.valor) {
      melhorAtaque = { participanteId: l.participanteId, valor: l.golsPro }
    }
    if (melhorDefesa === null || l.golsContra < melhorDefesa.valor) {
      melhorDefesa = { participanteId: l.participanteId, valor: l.golsContra }
    }
  }
  if (melhorAtaque !== null && melhorAtaque.valor === 0) melhorAtaque = null

  // Maior goleada (exclui W.O.; empate não é goleada). Ordena asc para que o
  // desempate de diferença fique com a partida MAIS ANTIGA (determinístico).
  let maiorGoleada: Goleada | null = null
  const reais = elegiveis
    .filter((p) => !p.woDuplo && p.woVencedor == null)
    .sort(ordenarCronologico)
  for (const p of reais) {
    const dif = Math.abs(p.placar_1 - p.placar_2)
    if (dif === 0) continue
    if (maiorGoleada === null || dif > maiorGoleada.diferenca) {
      const l1Venceu = p.placar_1 > p.placar_2
      maiorGoleada = {
        vencedorId: l1Venceu ? p.participante_1 : p.participante_2,
        perdedorId: l1Venceu ? p.participante_2 : p.participante_1,
        placarVencedor: Math.max(p.placar_1, p.placar_2),
        placarPerdedor: Math.min(p.placar_1, p.placar_2),
        diferenca: dif,
        rodada: p.rodada,
        matchId: p.id,
      }
    }
  }

  // Sequências (por participante, ordem cronológica).
  const elegiveisOrdenados = [...elegiveis].sort(ordenarCronologico)
  const seq = sequenciasPorParticipante(elegiveisOrdenados)
  const maiorInvencibilidade = maiorSequencia(
    seq,
    (i) => i.resultado === "V" || i.resultado === "E"
  )
  const maiorSequenciaVitorias = maiorSequencia(seq, (i) => i.resultado === "V")
  const maiorSequenciaCleanSheets = maiorSequencia(seq, (i) => i.cleanSheet)

  // Média de gols por jogo JOGADO (exclui W.O. do numerador e do denominador).
  let gols = 0
  for (const p of reais) gols += p.placar_1 + p.placar_2
  const mediaGolsPorJogo = reais.length === 0 ? 0 : gols / reais.length

  return {
    melhorAtaque,
    melhorDefesa,
    maiorGoleada,
    maiorInvencibilidade,
    maiorSequenciaVitorias,
    maiorSequenciaCleanSheets,
    mediaGolsPorJogo,
  }
}

// ── Destaques de CARREIRA do competidor (sem ataque/defesa relativos) ────────

export interface DestaquesCompetidor {
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  /** Gols marcados/sofridos pelo competidor (só jogos reais). */
  golsPro: number
  golsContra: number
  /** A maior vitória DELE (exclui W.O.); null se nunca goleou. */
  maiorGoleada: Goleada | null
  maiorInvencibilidade: number
  maiorSequenciaVitorias: number
  maiorSequenciaCleanSheets: number
  /** Gols MARCADOS por jogo real (exclui W.O.). */
  mediaGolsPorJogo: number
}

/**
 * Destaques de CARREIRA de UM competidor (a página do competidor). Todas as
 * partidas devem já vir com o LADO do competidor re-chaveado para `participanteId`
 * canônico. Sem ataque/defesa relativos (uma linha só degeneraria). Ordena por
 * `ordenar` (default `ordenarPorData` — carreira cruza competições).
 */
export function calcularDestaquesCompetidor(
  participanteId: string,
  partidas: PartidaCronologica[],
  ordenar: (a: PartidaCronologica, b: PartidaCronologica) => number = ordenarPorData
): DestaquesCompetidor {
  const elegiveis = partidas
    .filter(ehElegivel)
    .filter(
      (p) => p.participante_1 === participanteId || p.participante_2 === participanteId
    )
    .sort(ordenar)

  let vitorias = 0
  let empates = 0
  let derrotas = 0
  let golsPro = 0
  let golsContra = 0
  let golsReais = 0
  let jogosReais = 0
  let maiorGoleada: Goleada | null = null
  const seqItens: ItemSequencia[] = []

  for (const p of elegiveis) {
    const lado: 1 | 2 = p.participante_1 === participanteId ? 1 : 2
    const r = resultadoDoLado(p, lado)
    if (r.resultado === "V") vitorias += 1
    else if (r.resultado === "E") empates += 1
    else derrotas += 1
    seqItens.push({ resultado: r.resultado, cleanSheet: r.cleanSheet })

    // Gols e goleada só em jogo real (W.O. sem gols).
    if (!r.wo) {
      const meu = lado === 1 ? p.placar_1 : p.placar_2
      const dele = lado === 1 ? p.placar_2 : p.placar_1
      golsPro += meu
      golsContra += dele
      golsReais += meu
      jogosReais += 1
      const dif = meu - dele
      if (dif > 0 && (maiorGoleada === null || dif > maiorGoleada.diferenca)) {
        maiorGoleada = {
          vencedorId: participanteId,
          perdedorId: lado === 1 ? p.participante_2 : p.participante_1,
          placarVencedor: meu,
          placarPerdedor: dele,
          diferenca: dif,
          rodada: p.rodada,
          matchId: p.id,
        }
      }
    }
  }

  const seq = new Map<string, ItemSequencia[]>([[participanteId, seqItens]])
  const inv = maiorSequencia(seq, (i) => i.resultado === "V" || i.resultado === "E")
  const vit = maiorSequencia(seq, (i) => i.resultado === "V")
  const cs = maiorSequencia(seq, (i) => i.cleanSheet)

  return {
    jogos: vitorias + empates + derrotas,
    vitorias,
    empates,
    derrotas,
    golsPro,
    golsContra,
    maiorGoleada,
    maiorInvencibilidade: inv?.extensao ?? 0,
    maiorSequenciaVitorias: vit?.extensao ?? 0,
    maiorSequenciaCleanSheets: cs?.extensao ?? 0,
    mediaGolsPorJogo: jogosReais === 0 ? 0 : golsReais / jogosReais,
  }
}

// ── Confronto direto histórico ──────────────────────────────────────────────

export interface JogoConfronto {
  matchId: string
  rodada: number | null
  criadaEm: string
  placarA: number
  placarB: number
  /** Resultado na perspectiva de A (espelha `aplicarPartida`). */
  resultadoA: Resultado
  wo: boolean
  woDuplo: boolean
}

export interface ConfrontoDireto {
  jogos: JogoConfronto[]
  aVitorias: number
  empates: number
  bVitorias: number
  /** Derrota MÚTUA (ambos ausentes) — não é vitória de ninguém. */
  duploWo: number
  aDerrotas: number
  bDerrotas: number
  aGolsPro: number
  aGolsContra: number
}

/**
 * Histórico agregado de confronto direto entre `idA` e `idB` (as partidas devem
 * vir com os LADOS já re-chaveados para os ids canônicos dos competidores). Cada
 * jogo guarda `resultadoA` (perspectiva de A); o agregado respeita o duplo W.O.
 * (contado à parte em `duploWo`, nunca vitória). Invariantes:
 *   jogos.length = aVitorias + bVitorias + empates + duploWo
 *   aDerrotas = bVitorias + duploWo ; bDerrotas = aVitorias + duploWo
 * Gols só de jogos reais (W.O. sem gols). Default `ordenarPorData` (o confronto
 * pode cruzar temporadas).
 */
export function confrontoDireto(
  idA: string,
  idB: string,
  partidas: PartidaCronologica[],
  ordenar: (a: PartidaCronologica, b: PartidaCronologica) => number = ordenarPorData
): ConfrontoDireto {
  const entre = partidas
    .filter(ehElegivel)
    .filter(
      (p) =>
        (p.participante_1 === idA && p.participante_2 === idB) ||
        (p.participante_1 === idB && p.participante_2 === idA)
    )
    .sort(ordenar)

  const jogos: JogoConfronto[] = []
  let aVitorias = 0
  let empates = 0
  let bVitorias = 0
  let duploWo = 0
  let aGolsPro = 0
  let aGolsContra = 0

  for (const p of entre) {
    const aEhLado1 = p.participante_1 === idA
    const placarA = aEhLado1 ? p.placar_1 : p.placar_2
    const placarB = aEhLado1 ? p.placar_2 : p.placar_1
    const ladoA: 1 | 2 = aEhLado1 ? 1 : 2
    const r = resultadoDoLado(p, ladoA)

    jogos.push({
      matchId: p.id,
      rodada: p.rodada,
      criadaEm: p.criadaEm,
      placarA,
      placarB,
      resultadoA: r.resultado,
      wo: r.wo && !p.woDuplo,
      woDuplo: !!p.woDuplo,
    })

    if (p.woDuplo) {
      duploWo += 1 // resultadoA === "D", mas NÃO é vitória de B
    } else if (r.resultado === "V") {
      aVitorias += 1
    } else if (r.resultado === "E") {
      empates += 1
    } else {
      bVitorias += 1 // derrota de A que não é duplo W.O. = vitória de B
    }

    if (!r.wo) {
      aGolsPro += placarA
      aGolsContra += placarB
    }
  }

  return {
    jogos,
    aVitorias,
    empates,
    bVitorias,
    duploWo,
    aDerrotas: bVitorias + duploWo,
    bDerrotas: aVitorias + duploWo,
    aGolsPro,
    aGolsContra,
  }
}

// ── Bloco de insights por classificação (torneio/divisão) ───────────────────

export interface InsightsClassificacao {
  formaPorParticipante: Map<string, ItemForma[]>
  destaques: Destaques
}

/** Re-chaveia os ids de um bloco de insights (slot→competitor na divisão). */
export function rechavearInsights(
  ins: InsightsClassificacao,
  mapear: (id: string) => string
): InsightsClassificacao {
  const forma = new Map<string, ItemForma[]>()
  for (const [id, itens] of ins.formaPorParticipante) forma.set(mapear(id), itens)

  const d = ins.destaques
  const remapDestaque = (x: DestaqueParticipante | null) =>
    x ? { participanteId: mapear(x.participanteId), valor: x.valor } : null
  const remapSeq = (x: SequenciaParticipante | null) =>
    x ? { participanteId: mapear(x.participanteId), extensao: x.extensao } : null
  const remapGoleada = (x: Goleada | null) =>
    x
      ? { ...x, vencedorId: mapear(x.vencedorId), perdedorId: mapear(x.perdedorId) }
      : null

  return {
    formaPorParticipante: forma,
    destaques: {
      melhorAtaque: remapDestaque(d.melhorAtaque),
      melhorDefesa: remapDestaque(d.melhorDefesa),
      maiorGoleada: remapGoleada(d.maiorGoleada),
      maiorInvencibilidade: remapSeq(d.maiorInvencibilidade),
      maiorSequenciaVitorias: remapSeq(d.maiorSequenciaVitorias),
      maiorSequenciaCleanSheets: remapSeq(d.maiorSequenciaCleanSheets),
      mediaGolsPorJogo: d.mediaGolsPorJogo,
    },
  }
}
