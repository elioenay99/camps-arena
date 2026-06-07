import type { MatchStatus } from "@/lib/supabase/database.types"

/** Regras de pontuação do torneio (colunas pontos_* de `tournaments`). */
export interface RegrasPontuacao {
  vitoria: number
  empate: number
  derrota: number
}

/** Recorte mínimo de partida que o motor precisa (independe do fetch). */
export interface PartidaClassificavel {
  participante_1: string | null
  participante_2: string | null
  placar_1: number
  placar_2: number
  status: MatchStatus
  /**
   * W.O. (walkover): id opaco do lado vencedor (= participante_1 ou
   * participante_2), ou null em jogo normal. Quando presente, o motor IGNORA o
   * placar (W.O. é 0x0 no banco) e credita só os PONTOS de vitória/derrota, sem
   * gols/saldo — decisão de produto. Opcional: fixtures antigas omitem (= jogo
   * normal).
   */
  woVencedor?: string | null
}

export interface LinhaClassificacao {
  participanteId: string
  /** Posição estilo competição: empatados dividem (1º, 1º, 3º). */
  posicao: number
  pontos: number
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  golsPro: number
  golsContra: number
  saldo: number
}

interface Acumulado {
  participanteId: string
  pontos: number
  vitorias: number
  empates: number
  derrotas: number
  golsPro: number
  golsContra: number
}

/**
 * Partida pontua só quando encerrada E com os dois lados definidos. O
 * descarte de self-match espelha a CHECK `matches_participantes_distintos`
 * (defesa em profundidade: dado corrompido não duplica acumuladores).
 */
function ehElegivel(
  p: PartidaClassificavel
): p is PartidaClassificavel & { participante_1: string; participante_2: string } {
  return (
    p.status === "encerrada" &&
    p.participante_1 !== null &&
    p.participante_2 !== null &&
    p.participante_1 !== p.participante_2
  )
}

/**
 * Calcula a classificação de um torneio de pontos corridos. Função PURA — sem
 * IO — para ser exaustivamente testável; o Tier 2 liga fetch → motor → render.
 *
 * Cadeia de desempate (decisão de produto, estilo CBF simplificado):
 * pontos → vitórias → saldo de gols → gols pró → confronto direto (SÓ entre
 * exatamente 2 empatados — com 3+ o critério é pulado, evitando o ciclo
 * não-determinístico A>B>C>A) → empate persistente dividindo a posição.
 * A ordem de apresentação entre empatados persistentes é determinística
 * (por id), mas a `posicao` é a mesma.
 */
export function computeStandings(
  regras: RegrasPontuacao,
  partidas: PartidaClassificavel[]
): LinhaClassificacao[] {
  const elegiveis = partidas.filter(ehElegivel)

  // 1) Acumula resultados por participante.
  const acumulados = new Map<string, Acumulado>()
  const obter = (id: string): Acumulado => {
    let a = acumulados.get(id)
    if (!a) {
      a = {
        participanteId: id,
        pontos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        golsPro: 0,
        golsContra: 0,
      }
      acumulados.set(id, a)
    }
    return a
  }

  for (const p of elegiveis) {
    const lado1 = obter(p.participante_1)
    const lado2 = obter(p.participante_2)

    // W.O.: vitória SÓ nos pontos, ZERO gols (decisão de produto). O placar é
    // 0x0 no banco — usar o placar marcaria empate; o vencedor é explícito.
    if (p.woVencedor != null) {
      const vencedor = p.woVencedor === p.participante_1 ? lado1 : lado2
      const perdedor = vencedor === lado1 ? lado2 : lado1
      vencedor.vitorias += 1
      vencedor.pontos += regras.vitoria
      perdedor.derrotas += 1
      perdedor.pontos += regras.derrota
      continue // não toca golsPro/golsContra
    }

    lado1.golsPro += p.placar_1
    lado1.golsContra += p.placar_2
    lado2.golsPro += p.placar_2
    lado2.golsContra += p.placar_1

    if (p.placar_1 > p.placar_2) {
      lado1.vitorias += 1
      lado1.pontos += regras.vitoria
      lado2.derrotas += 1
      lado2.pontos += regras.derrota
    } else if (p.placar_1 < p.placar_2) {
      lado2.vitorias += 1
      lado2.pontos += regras.vitoria
      lado1.derrotas += 1
      lado1.pontos += regras.derrota
    } else {
      lado1.empates += 1
      lado2.empates += 1
      lado1.pontos += regras.empate
      lado2.pontos += regras.empate
    }
  }

  // 2) Ordena pelos critérios objetivos (id como ordem estável provisória).
  //    Comparação por code-point (não localeCompare): independe do locale/ICU
  //    do runtime — determinístico em qualquer ambiente.
  const saldo = (a: Acumulado) => a.golsPro - a.golsContra
  const porId = (a: Acumulado, b: Acumulado) =>
    a.participanteId < b.participanteId ? -1 : a.participanteId > b.participanteId ? 1 : 0
  const linhas = [...acumulados.values()].sort(
    (a, b) =>
      b.pontos - a.pontos ||
      b.vitorias - a.vitorias ||
      saldo(b) - saldo(a) ||
      b.golsPro - a.golsPro ||
      porId(a, b)
  )

  // 3) Agrupa empatados nos 4 critérios objetivos.
  const empatados = (a: Acumulado, b: Acumulado) =>
    a.pontos === b.pontos &&
    a.vitorias === b.vitorias &&
    saldo(a) === saldo(b) &&
    a.golsPro === b.golsPro

  const grupos: Acumulado[][] = []
  for (const linha of linhas) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && empatados(ultimo[0], linha)) ultimo.push(linha)
    else grupos.push([linha])
  }

  // 4) Confronto direto: pontos somados nas partidas elegíveis ENTRE os dois,
  //    com as MESMAS regras do torneio. Só para grupos de exatamente 2.
  const pontosConfronto = (eu: string, rival: string) => {
    let pontos = 0
    for (const p of elegiveis) {
      const direto =
        (p.participante_1 === eu && p.participante_2 === rival) ||
        (p.participante_1 === rival && p.participante_2 === eu)
      if (!direto) continue
      // W.O. entre os dois: vitória/derrota pelo vencedor explícito — o 0x0
      // contaria como empate e contradiria a vitória nos pontos.
      if (p.woVencedor != null) {
        pontos += p.woVencedor === eu ? regras.vitoria : regras.derrota
        continue
      }
      const meuPlacar = p.participante_1 === eu ? p.placar_1 : p.placar_2
      const placarRival = p.participante_1 === eu ? p.placar_2 : p.placar_1
      if (meuPlacar > placarRival) pontos += regras.vitoria
      else if (meuPlacar < placarRival) pontos += regras.derrota
      else pontos += regras.empate
    }
    return pontos
  }

  // 5) Resolve cada grupo em "clusters" de indistinguíveis (dividem posição).
  const clusters: Acumulado[][] = []
  for (const grupo of grupos) {
    if (grupo.length === 2) {
      const [a, b] = grupo
      const pa = pontosConfronto(a.participanteId, b.participanteId)
      const pb = pontosConfronto(b.participanteId, a.participanteId)
      if (pa > pb) clusters.push([a], [b])
      else if (pb > pa) clusters.push([b], [a])
      else clusters.push(grupo) // persistente: dividem a posição
    } else {
      // 1 (sem empate) ou 3+ (CBF pula o confronto direto): cluster único.
      clusters.push(grupo)
    }
  }

  // 6) Posição estilo competição: o cluster inteiro recebe a mesma posição e
  //    o próximo pula os lugares ocupados (1º, 1º, 3º).
  const resultado: LinhaClassificacao[] = []
  let posicao = 1
  for (const cluster of clusters) {
    for (const a of cluster) {
      resultado.push({
        participanteId: a.participanteId,
        posicao,
        pontos: a.pontos,
        jogos: a.vitorias + a.empates + a.derrotas,
        vitorias: a.vitorias,
        empates: a.empates,
        derrotas: a.derrotas,
        golsPro: a.golsPro,
        golsContra: a.golsContra,
        saldo: saldo(a),
      })
    }
    posicao += cluster.length
  }
  return resultado
}
