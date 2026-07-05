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
  /**
   * Duplo W.O. (ambos ausentes): quando true, o motor credita DERROTA aos DOIS
   * lados (pontos de derrota, sem gols/saldo), espelho simétrico do W.O. simples
   * — nunca empate pelo 0x0. Mutuamente exclusivo com `woVencedor` (o duplo não
   * tem vencedor). Opcional: fixtures sem duplo omitem (= false).
   */
  woDuplo?: boolean
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
 * Preset de desempate. `cbf`/`ingles` reordenam a cadeia objetiva (confronto
 * direto só entre EXATAMENTE 2; 3+ dividem). `espanhol`/`fifa` (Fase 5) usam a
 * MINI-TABELA: sub-classificação só com os jogos ENTRE os empatados, ciclo-segura
 * (soma pontos numa mini-liga). `custom` é reservado e degrada para `cbf`.
 */
export type TiebreakerPreset = "cbf" | "ingles" | "custom" | "espanhol" | "fifa"

/** Comparador objetivo (estilo `Array.sort`: negativo/zero/positivo). */
type Comparador = (a: Acumulado, b: Acumulado) => number

/**
 * Receita de desempate: a cadeia PRIMÁRIA de comparadores objetivos (define o
 * grupo de empate), a estratégia de RESOLUÇÃO desse grupo (confronto direto só
 * entre 2, ou mini-tabela entre 2+) e o FALLBACK objetivo aplicado APÓS a
 * mini-tabela para os ainda iguais (`[]` no confronto direto, que não tem etapa
 * posterior).
 */
export interface TiebreakerSpec {
  comparadores: Comparador[]
  /** `confrontoDireto2` = legado (cbf/ingles); `miniTabela` = espanhol/fifa. */
  resolucao: "confrontoDireto2" | "miniTabela"
  fallback: Comparador[]
}

const saldoDe = (a: Acumulado) => a.golsPro - a.golsContra

/** Comparadores objetivos atômicos (maior é melhor → descendente no sort). */
const cmpPontos = (a: Acumulado, b: Acumulado) => b.pontos - a.pontos
const cmpVitorias = (a: Acumulado, b: Acumulado) => b.vitorias - a.vitorias
const cmpSaldo = (a: Acumulado, b: Acumulado) => saldoDe(b) - saldoDe(a)
const cmpGolsPro = (a: Acumulado, b: Acumulado) => b.golsPro - a.golsPro

/**
 * Tabela de presets → spec. 'cbf' é BYTE-IDÊNTICO à cadeia hardcoded legada
 * (pontos → vitórias → saldo → gols pró, confronto direto só em 2). 'ingles'
 * reordena a cadeia objetiva (pontos → saldo → gols pró → vitórias). 'espanhol'
 * (La Liga): pontos → MINI-TABELA (confronto entre os empatados) → saldo/gols
 * globais. 'fifa' (grupo de Copa): pontos → saldo → gols pró globais →
 * MINI-TABELA. 'custom' é reservado: degrada para 'cbf'.
 */
export function obterTiebreakerSpec(preset: TiebreakerPreset): TiebreakerSpec {
  switch (preset) {
    case "ingles":
      return {
        comparadores: [cmpPontos, cmpSaldo, cmpGolsPro, cmpVitorias],
        resolucao: "confrontoDireto2",
        fallback: [],
      }
    case "espanhol":
      return {
        comparadores: [cmpPontos],
        resolucao: "miniTabela",
        fallback: [cmpSaldo, cmpGolsPro],
      }
    case "fifa":
      return {
        comparadores: [cmpPontos, cmpSaldo, cmpGolsPro],
        resolucao: "miniTabela",
        fallback: [],
      }
    case "cbf":
    case "custom":
    default:
      return {
        comparadores: [cmpPontos, cmpVitorias, cmpSaldo, cmpGolsPro],
        resolucao: "confrontoDireto2",
        fallback: [],
      }
  }
}

/** Partida já filtrada por `ehElegivel` (lados definidos, encerrada). */
type PartidaElegivel = PartidaClassificavel & {
  participante_1: string
  participante_2: string
}

function novoAcumulado(id: string): Acumulado {
  return {
    participanteId: id,
    pontos: 0,
    vitorias: 0,
    empates: 0,
    derrotas: 0,
    golsPro: 0,
    golsContra: 0,
  }
}

/**
 * Credita UMA partida elegível nos acumuladores dos dois lados, com as regras do
 * torneio. W.O.: vitória/derrota SÓ nos pontos (zero gols — o placar é 0x0 no
 * banco). Fonte ÚNICA de acúmulo — usada na tabela geral E na mini-tabela.
 */
function aplicarPartida(
  lado1: Acumulado,
  lado2: Acumulado,
  p: PartidaElegivel,
  regras: RegrasPontuacao
): void {
  // Duplo W.O.: os DOIS levam derrota (pontos de derrota), 0 gols. ANTES do ramo
  // de placar — senão o 0x0 cairia em empate. Mutuamente exclusivo com woVencedor.
  if (p.woDuplo) {
    lado1.derrotas += 1
    lado1.pontos += regras.derrota
    lado2.derrotas += 1
    lado2.pontos += regras.derrota
    return // não toca golsPro/golsContra
  }

  if (p.woVencedor != null) {
    const vencedor = p.woVencedor === p.participante_1 ? lado1 : lado2
    const perdedor = vencedor === lado1 ? lado2 : lado1
    vencedor.vitorias += 1
    vencedor.pontos += regras.vitoria
    perdedor.derrotas += 1
    perdedor.pontos += regras.derrota
    return // não toca golsPro/golsContra
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

/** Desempate final estável por id (code-point, cross-locale; determinístico). */
const porId = (a: Acumulado, b: Acumulado) =>
  a.participanteId < b.participanteId ? -1 : a.participanteId > b.participanteId ? 1 : 0

/**
 * Resolve um grupo de empatados pela MINI-TABELA (presets `espanhol`/`fifa`):
 * sub-classificação usando SÓ os jogos ENTRE os empatados (mini-pontos →
 * mini-saldo → mini-gols pró), com `fallback` objetivo GLOBAL para os ainda
 * iguais e `porId` final. Ciclo-segura (soma pontos numa mini-liga, não compara
 * aos pares). Devolve sub-clusters NA ORDEM (cada sub-cluster divide a posição).
 */
function resolverMiniTabela(
  grupo: Acumulado[],
  elegiveis: PartidaElegivel[],
  regras: RegrasPontuacao,
  fallback: Comparador[]
): Acumulado[][] {
  const ids = new Set(grupo.map((g) => g.participanteId))
  const mini = new Map<string, Acumulado>()
  for (const g of grupo) mini.set(g.participanteId, novoAcumulado(g.participanteId))
  for (const p of elegiveis) {
    if (!ids.has(p.participante_1) || !ids.has(p.participante_2)) continue
    aplicarPartida(mini.get(p.participante_1)!, mini.get(p.participante_2)!, p, regras)
  }

  const miniChain: Comparador[] = [cmpPontos, cmpSaldo, cmpGolsPro]
  const cmpGrupo = (a: Acumulado, b: Acumulado): number => {
    const ma = mini.get(a.participanteId)!
    const mb = mini.get(b.participanteId)!
    for (const cmp of miniChain) {
      const r = cmp(ma, mb)
      if (r !== 0) return r
    }
    for (const cmp of fallback) {
      const r = cmp(a, b) // fallback é sobre o acumulado GLOBAL
      if (r !== 0) return r
    }
    return porId(a, b)
  }
  // "Iguais" = empatados em TODA a mini-chain E no fallback global (porId não
  // conta: é ordem de apresentação, não posição).
  const iguais = (a: Acumulado, b: Acumulado): boolean => {
    const ma = mini.get(a.participanteId)!
    const mb = mini.get(b.participanteId)!
    return (
      miniChain.every((cmp) => cmp(ma, mb) === 0) &&
      fallback.every((cmp) => cmp(a, b) === 0)
    )
  }

  const ordenado = [...grupo].sort(cmpGrupo)
  const subClusters: Acumulado[][] = []
  for (const a of ordenado) {
    const ultimo = subClusters[subClusters.length - 1]
    if (ultimo && iguais(ultimo[0], a)) ultimo.push(a)
    else subClusters.push([a])
  }
  return subClusters
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
 * Pontos somados por `eu` nas partidas ENTRE `eu` e `rival`, com as regras do
 * torneio — EXTRAÇÃO da closure `pontosConfronto` (usada no desempate de 2), para
 * que o motor E os insights (confronto direto histórico) compartilhem a MESMA
 * fonte de verdade. Filtra por `ehElegivel` internamente (idempotente: o motor
 * passa `elegiveis`, mas isolar o filtro deixa a função correta para qualquer
 * consumidor). Behavior-idêntica à lógica anterior.
 */
export function pontosDoConfronto(
  eu: string,
  rival: string,
  partidas: PartidaClassificavel[],
  regras: RegrasPontuacao
): number {
  let pontos = 0
  for (const p of partidas) {
    if (!ehElegivel(p)) continue
    const direto =
      (p.participante_1 === eu && p.participante_2 === rival) ||
      (p.participante_1 === rival && p.participante_2 === eu)
    if (!direto) continue
    // Duplo W.O. entre os dois: DERROTA para ambos — o 0x0 contaria como empate
    // e contradiria a dupla derrota (nenhum venceu o confronto).
    if (p.woDuplo) {
      pontos += regras.derrota
      continue
    }
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

/**
 * Calcula a classificação de um torneio de pontos corridos. Função PURA — sem
 * IO — para ser exaustivamente testável; o Tier 2 liga fetch → motor → render.
 *
 * Cadeia de desempate parametrizável por `tiebreaker` (default 'cbf' preserva
 * 100% do comportamento legado). A spec do preset define a cadeia de
 * comparadores objetivos e se o confronto direto fica restrito a EXATAMENTE 2
 * empatados (com 3+ o critério é pulado, evitando o ciclo não-determinístico
 * A>B>C>A). O confronto direto e o empate persistente (dividindo a posição)
 * fecham a cadeia, com `porId` como tiebreaker final determinístico — a ordem
 * de apresentação entre empatados persistentes é estável (por id), mas a
 * `posicao` é a mesma.
 *
 * Preset 'cbf' (default): pontos → vitórias → saldo de gols → gols pró,
 * confronto direto só em 2. Preset 'ingles': pontos → saldo → gols pró →
 * vitórias, confronto direto só em 2.
 */
export function computeStandings(
  regras: RegrasPontuacao,
  partidas: PartidaClassificavel[],
  tiebreaker: TiebreakerPreset = "cbf"
): LinhaClassificacao[] {
  const elegiveis = partidas.filter(ehElegivel)

  // 1) Acumula resultados por participante (fonte única `aplicarPartida`).
  const acumulados = new Map<string, Acumulado>()
  const obter = (id: string): Acumulado => {
    let a = acumulados.get(id)
    if (!a) {
      a = novoAcumulado(id)
      acumulados.set(id, a)
    }
    return a
  }

  for (const p of elegiveis) {
    aplicarPartida(obter(p.participante_1), obter(p.participante_2), p, regras)
  }

  // 2) Ordena pela cadeia objetiva do preset (id como ordem estável
  //    provisória). Comparação por code-point (não localeCompare): independe do
  //    locale/ICU do runtime — determinístico em qualquer ambiente.
  const spec = obterTiebreakerSpec(tiebreaker)
  const saldo = saldoDe
  const linhas = [...acumulados.values()].sort((a, b) => {
    for (const cmp of spec.comparadores) {
      const r = cmp(a, b)
      if (r !== 0) return r
    }
    return porId(a, b)
  })

  // 3) Agrupa empatados em TODOS os critérios objetivos do preset (dois lados
  //    são indistinguíveis quando nenhum comparador da cadeia os separa).
  const empatados = (a: Acumulado, b: Acumulado) =>
    spec.comparadores.every((cmp) => cmp(a, b) === 0)

  const grupos: Acumulado[][] = []
  for (const linha of linhas) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && empatados(ultimo[0], linha)) ultimo.push(linha)
    else grupos.push([linha])
  }

  // 4) Confronto direto: pontos somados nas partidas elegíveis ENTRE os dois,
  //    com as MESMAS regras do torneio. Só para grupos de exatamente 2. Delega à
  //    função pura exportada `pontosDoConfronto` (fonte única com os insights).
  const pontosConfronto = (eu: string, rival: string) =>
    pontosDoConfronto(eu, rival, elegiveis, regras)

  // 5) Resolve cada grupo em "clusters" de indistinguíveis (dividem posição).
  //    `confrontoDireto2` (cbf/inglês): só 2 empatados se resolvem por confronto
  //    direto; 3+ pulam (evita o ciclo A>B>C>A) e dividem a posição.
  //    `miniTabela` (espanhol/fifa): sub-classificação ciclo-segura entre 2+.
  const clusters: Acumulado[][] = []
  for (const grupo of grupos) {
    if (grupo.length === 1) {
      clusters.push(grupo)
    } else if (spec.resolucao === "miniTabela") {
      clusters.push(...resolverMiniTabela(grupo, elegiveis, regras, spec.fallback))
    } else if (grupo.length === 2) {
      const [a, b] = grupo
      const pa = pontosConfronto(a.participanteId, b.participanteId)
      const pb = pontosConfronto(b.participanteId, a.participanteId)
      if (pa > pb) clusters.push([a], [b])
      else if (pb > pa) clusters.push([b], [a])
      else clusters.push(grupo) // persistente: dividem a posição
    } else {
      // 3+ no confronto direto: pula (cluster único, dividem a posição).
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
