/**
 * Motor PURO do mata-mata (chave eliminatória) — zero IO, mesma filosofia do
 * gerarTabelaLiga: a action busca participantes, chama o motor e insere o
 * resultado; a UI usa o MESMO módulo para a prévia e os rótulos (fonte única).
 *
 * Modelo da chave (flat em matches): `rodada` = fase (1-based), `posicao` =
 * slot do confronto dentro da fase, `perna` = 1|2 em ida-e-volta (NULL em
 * jogo único/bye). Pareamento FIXO entre fases: vencedor do slot 2i-1 ×
 * vencedor do slot 2i → slot i da fase seguinte. Bye é PARTIDA persistida
 * (participante_2 NULL, nasce encerrada 0x0): é a memória durável do slot —
 * o sorteio não é re-derivável depois.
 *
 * Determinismo: toda aleatoriedade é INJETADA pelo chamador via `RandInt`
 * (a action usa crypto; os testes, um gerador fixo). O motor nunca chama
 * Math.random/crypto.
 */

import type { MatchStatus } from "@/lib/supabase/database.types"

/** Limite de participantes (chave de 32 → 5 fases). */
export const MATA_MATA_MAX_PARTICIPANTES = 32

/**
 * Formatos cuja disputa inclui uma CHAVE eliminatória (atual ou futura).
 * Compartilhado por actions/policies de congelamento e avanço de fase.
 */
export const FORMATOS_COM_CHAVE = [
  "mata_mata",
  "grupos_mata_mata",
  "fase_liga",
] as const

export type FormatoComChave = (typeof FORMATOS_COM_CHAVE)[number]

/** Tamanhos de chave válidos no modo potes (sem byes — chave completa). */
export const TAMANHOS_POTES = [4, 8, 16, 32] as const

export type ModoChaveamento = "sorteio" | "potes" | "manual"

/** Inteiro uniforme em [0, n). Injetado: crypto na action, fixo nos testes. */
export type RandInt = (n: number) => number

/** Confronto da 1ª fase: lado 2 nulo = bye (o lado 1 avança direto). */
export interface ConfrontoChave {
  posicao: number
  participante_1: string
  participante_2: string | null
}

/** Partida a inserir (a action acrescenta tournament_id e o status do bye). */
export interface PartidaChave {
  rodada: number
  posicao: number
  perna: number | null
  participante_1: string
  participante_2: string | null
  /** Avanço direto: nasce `encerrada` 0x0 (sem jogo). */
  bye: boolean
}

/** Linha de partida já persistida (shape do banco) — insumo do avanço. */
export interface PartidaJogada {
  rodada: number | null
  posicao: number | null
  perna: number | null
  participante_1: string | null
  participante_2: string | null
  placar_1: number
  placar_2: number
  status: MatchStatus
  /**
   * W.O.: id opaco do lado vencedor (= participante_1 ou participante_2), ou
   * null em jogo normal. Decide o confronto INTEIRO (decisão de produto): em
   * ida-e-volta, um W.O. em qualquer perna basta — a outra perna e o agregado
   * são ignorados. Opcional: fixtures antigas omitem.
   */
  woVencedor?: string | null
}

/** Menor potência de 2 >= n (tamanho da chave; n >= 1). */
export function tamanhoChave(n: number): number {
  let s = 1
  while (s < n) s *= 2
  return s
}

/** Nº de fases de uma chave de tamanho s (potência de 2). */
export function totalFases(s: number): number {
  return Math.round(Math.log2(s))
}

/**
 * Fisher-Yates com gerador injetado — cópia, não muta a entrada.
 */
export function embaralhar<T>(itens: T[], randInt: RandInt): T[] {
  const arr = [...itens]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function validarParticipantes(participantes: string[]): void {
  if (participantes.length < 2) {
    throw new Error("O mata-mata precisa de pelo menos 2 participantes.")
  }
  if (participantes.length > MATA_MATA_MAX_PARTICIPANTES) {
    throw new Error(
      `O mata-mata aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} participantes.`
    )
  }
  if (new Set(participantes).size !== participantes.length) {
    throw new Error("Participantes duplicados na geração da chave.")
  }
}

/**
 * Posições (1-based) dos confrontos que recebem bye: espaçadas uniformemente
 * pela chave (byes vizinhos se reencontrariam cedo demais na fase 2).
 * `byes < confrontos` (garantido por B = S - N < S/2) ⇒ posições distintas.
 */
function posicoesComBye(confrontos: number, byes: number): Set<number> {
  const posicoes = new Set<number>()
  for (let i = 0; i < byes; i++) {
    posicoes.add(Math.floor((i * confrontos) / byes) + 1)
  }
  return posicoes
}

/**
 * Modo SORTEIO: embaralha todos e distribui nos slots; byes (chave
 * incompleta) ficam em posições espaçadas com ocupante sorteado.
 */
export function montarConfrontosSorteio(
  participantes: string[],
  randInt: RandInt
): ConfrontoChave[] {
  validarParticipantes(participantes)
  const s = tamanhoChave(participantes.length)
  const confrontos = s / 2
  const byes = s - participantes.length

  const ordem = embaralhar(participantes, randInt)
  const slotsComBye = posicoesComBye(confrontos, byes)

  const resultado: ConfrontoChave[] = []
  let k = 0
  for (let posicao = 1; posicao <= confrontos; posicao++) {
    if (slotsComBye.has(posicao)) {
      resultado.push({ posicao, participante_1: ordem[k++], participante_2: null })
    } else {
      resultado.push({
        posicao,
        participante_1: ordem[k++],
        participante_2: ordem[k++],
      })
    }
  }
  return resultado
}

/**
 * Modo POTES: cabeças de chave × demais — todo confronto da 1ª fase tem
 * exatamente UMA cabeça (cabeças não se enfrentam na estreia; a partir da
 * fase 2 a chave segue o pareamento normal). Exige chave completa
 * (4/8/16/32, decisão de produto): byes + potes gerariam sobras do pote 2
 * se enfrentando — chave injusta.
 */
export function montarConfrontosPotes(
  cabecas: string[],
  demais: string[],
  randInt: RandInt
): ConfrontoChave[] {
  const todos = [...cabecas, ...demais]
  validarParticipantes(todos)
  if (!(TAMANHOS_POTES as readonly number[]).includes(todos.length)) {
    throw new Error(
      `O sorteio por potes exige ${TAMANHOS_POTES.join(", ")} participantes (chave completa).`
    )
  }
  if (cabecas.length !== demais.length) {
    throw new Error(
      "Marque exatamente metade dos participantes como cabeças de chave."
    )
  }

  const pote1 = embaralhar(cabecas, randInt)
  const pote2 = embaralhar(demais, randInt)
  return pote1.map((cabeca, i) => ({
    posicao: i + 1,
    participante_1: cabeca,
    participante_2: pote2[i],
  }))
}

/**
 * Modo MANUAL: o dono monta os confrontos. Valida a PARTIÇÃO exata (cada
 * participante confirmado em exatamente um confronto; nº de confrontos =
 * metade da chave; ≤1 lado vazio por confronto — bye normalizado no lado 1).
 */
export function montarConfrontosManual(
  pares: [string | null, string | null][],
  participantes: string[]
): ConfrontoChave[] {
  validarParticipantes(participantes)
  const s = tamanhoChave(participantes.length)
  const confrontos = s / 2
  if (pares.length !== confrontos) {
    throw new Error(
      `A chave de ${participantes.length} participantes tem ${confrontos} confrontos.`
    )
  }

  const usados = pares.flat().filter((p): p is string => p !== null)
  if (new Set(usados).size !== usados.length) {
    throw new Error("Cada participante entra em um único confronto.")
  }
  const confirmados = new Set(participantes)
  if (
    usados.length !== participantes.length ||
    !usados.every((p) => confirmados.has(p))
  ) {
    throw new Error(
      "Distribua todos os participantes confirmados (e somente eles) nos confrontos."
    )
  }

  return pares.map(([lado1, lado2], i) => {
    if (lado1 === null && lado2 === null) {
      throw new Error(`O confronto ${i + 1} está vazio.`)
    }
    // Bye sempre no lado 1 (convenção do modelo: participante_2 NULL = bye).
    const [p1, p2] = lado1 === null ? [lado2, lado1] : [lado1, lado2]
    return { posicao: i + 1, participante_1: p1 as string, participante_2: p2 }
  })
}

/**
 * Partidas da 1ª fase a partir dos confrontos montados. Ida-e-volta gera as
 * duas pernas com lados invertidos — EXCETO quando a 1ª fase já é a final
 * (confronto único): final é sempre jogo único (decisão de produto).
 * `rodadaBase` (default 1) permite à chave começar APÓS outra fase (formatos
 * de grupos usam rodadas contínuas — ver D2 do add-group-stage-format).
 */
export function gerarFaseInicial(
  confrontos: ConfrontoChave[],
  idaEVolta: boolean,
  rodadaBase = 1
): PartidaChave[] {
  const ehFinal = confrontos.length === 1
  return confrontos.flatMap((c): PartidaChave[] => {
    if (c.participante_2 === null) {
      return [
        {
          rodada: rodadaBase,
          posicao: c.posicao,
          perna: null,
          participante_1: c.participante_1,
          participante_2: null,
          bye: true,
        },
      ]
    }
    if (idaEVolta && !ehFinal) {
      return [
        {
          rodada: rodadaBase,
          posicao: c.posicao,
          perna: 1,
          participante_1: c.participante_1,
          participante_2: c.participante_2,
          bye: false,
        },
        {
          rodada: rodadaBase,
          posicao: c.posicao,
          perna: 2,
          participante_1: c.participante_2,
          participante_2: c.participante_1,
          bye: false,
        },
      ]
    }
    return [
      {
        rodada: rodadaBase,
        posicao: c.posicao,
        perna: null,
        participante_1: c.participante_1,
        participante_2: c.participante_2,
        bye: false,
      },
    ]
  })
}

export interface ResultadoConfronto {
  vencedor: string
  /** Nulo em bye (não há perdedor real — relevante para o 3º lugar). */
  perdedor: string | null
}

/**
 * Decide um confronto a partir das partidas do slot (1 = jogo único/bye;
 * 2 = pernas de ida-e-volta). Devolve null se ainda indecidível (partida em
 * aberto, perna faltando ou empate — estados que action/trigger impedem de
 * persistir como encerrado).
 */
export function decidirConfronto(
  partidas: PartidaJogada[]
): ResultadoConfronto | null {
  if (partidas.length === 1) {
    const p = partidas[0]
    // Perna avulsa (a outra sumiu do lote): confronto de ida-e-volta NUNCA é
    // decidível por um jogo só — defensivo contra chamador com dados parciais.
    // EXCEÇÃO: W.O. decide o confronto inteiro (a outra perna nem precisa
    // existir) — ver o ramo de W.O. logo abaixo.
    const woUnico = resultadoWO(p)
    if (woUnico) return woUnico
    if (p.perna !== null) return null
    if (p.status !== "encerrada" || p.participante_1 === null) return null
    if (p.participante_2 === null) {
      return { vencedor: p.participante_1, perdedor: null } // bye
    }
    if (p.placar_1 === p.placar_2) return null
    return p.placar_1 > p.placar_2
      ? { vencedor: p.participante_1, perdedor: p.participante_2 }
      : { vencedor: p.participante_2, perdedor: p.participante_1 }
  }

  if (partidas.length === 2) {
    // W.O. em QUALQUER perna decide o confronto inteiro (decisão de produto):
    // não espera a outra perna nem soma agregado.
    for (const p of partidas) {
      const wo = resultadoWO(p)
      if (wo) return wo
    }
    const ida = partidas.find((p) => p.perna === 1)
    const volta = partidas.find((p) => p.perna === 2)
    if (!ida || !volta) return null
    if (ida.status !== "encerrada" || volta.status !== "encerrada") return null
    if (ida.participante_1 === null || ida.participante_2 === null) return null
    // Volta tem lados invertidos: agregado do mandante da ida soma o lado 2
    // da volta. Sem gol fora (agregado puro — regra abolida pela UEFA).
    const agregado1 = ida.placar_1 + volta.placar_2
    const agregado2 = ida.placar_2 + volta.placar_1
    if (agregado1 === agregado2) return null
    return agregado1 > agregado2
      ? { vencedor: ida.participante_1, perdedor: ida.participante_2 }
      : { vencedor: ida.participante_2, perdedor: ida.participante_1 }
  }

  return null
}

/**
 * W.O. de uma partida de chave: vencedor explícito decide o confronto. Devolve
 * null quando não é W.O. encerrado com os dois lados — aí a decisão segue por
 * placar/agregado. O perdedor é o outro lado (vai ao 3º lugar como derrota de
 * semi normal).
 */
function resultadoWO(p: PartidaJogada): ResultadoConfronto | null {
  if (
    p.status !== "encerrada" ||
    p.woVencedor == null ||
    p.participante_1 === null ||
    p.participante_2 === null
  ) {
    return null
  }
  return p.woVencedor === p.participante_1
    ? { vencedor: p.participante_1, perdedor: p.participante_2 }
    : { vencedor: p.participante_2, perdedor: p.participante_1 }
}

/** Slot do 3º lugar: convive com a final (posicao 1) na rodada final. */
export const POSICAO_TERCEIRO_LUGAR = 2

/**
 * A disputa de 3º lugar é a posicao 2 da FASE final. `faseRelativa` =
 * rodada − rodadaBase + 1 (chamadores que trabalham com rodadas contínuas
 * normalizam antes; no mata-mata puro base = 1 e fase = rodada).
 */
export function ehTerceiroLugar(
  faseRelativa: number | null,
  posicao: number | null,
  fases: number
): boolean {
  return faseRelativa === fases && posicao === POSICAO_TERCEIRO_LUGAR
}

/**
 * Rodada-base da chave: a MENOR rodada entre as partidas com `posicao`. No
 * mata-mata puro é 1; nos formatos de grupos a chave começa após as rodadas
 * de grupos (rodadas contínuas — colisão de par no índice único é evitada
 * por construção).
 */
export function rodadaBaseDaChave(partidas: PartidaJogada[]): number {
  let menor = Number.POSITIVE_INFINITY
  for (const p of partidas) {
    if (p.posicao !== null && p.rodada !== null && p.rodada < menor) {
      menor = p.rodada
    }
  }
  if (!Number.isFinite(menor)) {
    throw new Error("Chave sem partidas geradas.")
  }
  return menor
}

/**
 * Tamanho da chave derivado das PARTIDAS persistidas (2 × maior posicao da
 * fase inicial — byes incluídos). Não usa o nº atual de participantes: sair
 * do torneio depois de iniciado não pode mudar a geometria da chave.
 */
export function tamanhoChaveDasPartidas(partidas: PartidaJogada[]): number {
  const base = rodadaBaseDaChave(partidas)
  let maior = 0
  for (const p of partidas) {
    if (p.rodada === base && p.posicao !== null && p.posicao > maior) {
      maior = p.posicao
    }
  }
  return maior * 2
}

/**
 * Gera a fase seguinte a partir das partidas persistidas (todas as fases).
 * Lança erro descritivo quando a fase atual está incompleta — a action
 * converte em mensagem de UI. Devolve [] quando a final já existe (nada a
 * gerar; o campeão sai de decidirConfronto na UI).
 *
 * Semifinal → final: gera também a disputa de 3º lugar (posicao 2) quando
 * `terceiroLugar` e AMBOS os confrontos da semi têm perdedor real (semi-bye,
 * só possível em chave de 4 com N=3, não gera perdedor).
 */
export function gerarProximaFase(
  partidas: PartidaJogada[],
  opts: { idaEVolta: boolean; terceiroLugar: boolean }
): PartidaChave[] {
  const geradas = partidas.filter(
    (p): p is PartidaJogada & { rodada: number; posicao: number } =>
      p.rodada !== null && p.posicao !== null
  )
  const s = tamanhoChaveDasPartidas(geradas)
  const fases = totalFases(s)
  const base = rodadaBaseDaChave(geradas)
  const rodadaAtual = Math.max(...geradas.map((p) => p.rodada))
  // Fase RELATIVA: a chave pode começar após as rodadas de grupos (rodadas
  // contínuas) — a geometria é a mesma do mata-mata puro (base = 1).
  const faseAtual = rodadaAtual - base + 1
  if (faseAtual >= fases) {
    return [] // final (e 3º lugar, se houver) já gerados — torneio decidido
  }

  // Agrupa a fase atual por slot e decide cada confronto.
  const porSlot = new Map<number, PartidaJogada[]>()
  for (const p of geradas) {
    if (p.rodada !== rodadaAtual) continue
    const lista = porSlot.get(p.posicao) ?? []
    lista.push(p)
    porSlot.set(p.posicao, lista)
  }

  const slotsEsperados = s / 2 ** faseAtual
  const resultados: ResultadoConfronto[] = []
  for (let slot = 1; slot <= slotsEsperados; slot++) {
    const doSlot = porSlot.get(slot)
    if (!doSlot) {
      throw new Error("A chave está incompleta — recarregue a página.")
    }
    const resultado = decidirConfronto(doSlot)
    if (!resultado) {
      throw new Error(
        "Ainda há confronto sem vencedor nesta fase. Encerre todas as partidas antes de avançar."
      )
    }
    resultados.push(resultado)
  }

  const proxima = rodadaAtual + 1
  const ehFinal = slotsEsperados / 2 === 1
  const novas: PartidaChave[] = []
  for (let i = 0; i < slotsEsperados / 2; i++) {
    const a = resultados[2 * i].vencedor
    const b = resultados[2 * i + 1].vencedor
    if (idaEVoltaNaFase(opts.idaEVolta, ehFinal)) {
      novas.push(
        { rodada: proxima, posicao: i + 1, perna: 1, participante_1: a, participante_2: b, bye: false },
        { rodada: proxima, posicao: i + 1, perna: 2, participante_1: b, participante_2: a, bye: false }
      )
    } else {
      novas.push({
        rodada: proxima,
        posicao: i + 1,
        perna: null,
        participante_1: a,
        participante_2: b,
        bye: false,
      })
    }
  }

  if (ehFinal && opts.terceiroLugar) {
    const perdedorA = resultados[0].perdedor
    const perdedorB = resultados[1].perdedor
    // Semi-bye não tem perdedor: sem dois perdedores reais, não há disputa.
    if (perdedorA !== null && perdedorB !== null) {
      novas.push({
        rodada: proxima,
        posicao: POSICAO_TERCEIRO_LUGAR,
        perna: null, // 3º lugar é sempre jogo único (como a final)
        participante_1: perdedorA,
        participante_2: perdedorB,
        bye: false,
      })
    }
  }

  return novas
}

/** Final e 3º lugar são sempre jogo único, mesmo com ida-e-volta. */
function idaEVoltaNaFase(idaEVolta: boolean, ehFinal: boolean): boolean {
  return idaEVolta && !ehFinal
}

export interface PreviaMataMata {
  /** Jogos REAIS (byes não contam — não há partida disputada). */
  jogos: number
  fases: number
}

/**
 * Prévia para o painel de início — fórmulas fechadas, MESMA fonte do motor:
 * uma eliminatória de N participantes tem N-1 confrontos reais (cada um
 * elimina exatamente um); em ida-e-volta os N-2 confrontos não-finais valem
 * 2 jogos; o 3º lugar soma 1 quando há dois perdedores reais de semifinal
 * (N >= 4 — com N = 3 uma das semis é bye).
 */
export function previaMataMata(
  qtdParticipantes: number,
  idaEVolta: boolean,
  terceiroLugar: boolean
): PreviaMataMata {
  if (qtdParticipantes < 2) {
    return { jogos: 0, fases: 0 }
  }
  const s = tamanhoChave(qtdParticipantes)
  const jogosBase = idaEVolta
    ? (qtdParticipantes - 2) * 2 + 1
    : qtdParticipantes - 1
  const jogoTerceiro = terceiroLugar && qtdParticipantes >= 4 ? 1 : 0
  return { jogos: jogosBase + jogoTerceiro, fases: totalFases(s) }
}

/**
 * Rótulo da fase pelo nº de confrontos regulares (1=Final, 2=Semifinais...).
 * Chave de 32 tem uma fase de 16 confrontos antes das oitavas → "1ª fase".
 */
export function rotuloFase(rodada: number, fases: number): string {
  const confrontos = 2 ** (fases - rodada)
  if (confrontos === 1) return "Final"
  if (confrontos === 2) return "Semifinais"
  if (confrontos === 4) return "Quartas de final"
  if (confrontos === 8) return "Oitavas de final"
  return `${rodada}ª fase`
}

/* -------------------------------------------------------------------------- */
/* Playoff de liga (Fase 2): seeding por posição + leitura do resultado         */
/* -------------------------------------------------------------------------- */

/**
 * Ordem de seeding PADRÃO de uma chave de tamanho `s` (potência de 2): devolve
 * os números de seed (1-based) na ORDEM DE SLOT, de forma que o seed 1 e o seed 2
 * só se encontrem numa eventual final (espalhamento recursivo clássico).
 * Ex.: s=4 → [1,4,2,3]; s=8 → [1,8,4,5,2,7,3,6]. Em cada par (order[2i],
 * order[2i+1]) o primeiro é SEMPRE o melhor seed (≤ s/2 < o segundo).
 */
export function ordemDeSeed(s: number): number[] {
  let order = [1]
  while (order.length < s) {
    const n = order.length * 2
    const next: number[] = []
    for (const x of order) {
      next.push(x)
      next.push(n + 1 - x)
    }
    order = next
  }
  return order
}

/**
 * Semeia uma chave por POSIÇÃO na liga (determinístico, SEM aleatoriedade): o 1º
 * colocado (`participantesOrdenados[0]`) é o seed 1; o último, o seed N. Usa o
 * espalhamento padrão (1×N, 2×(N-1)…) para os favoritos se cruzarem tarde; os
 * byes (chave incompleta) vão para os melhores seeds (o lado 2 fantasma vira
 * bye). Pareia para casar com o pareamento fixo 2i-1×2i das fases seguintes.
 * NÃO embaralha nem reordena — o seeding por classificação é a essência do playoff.
 */
export function semearPlayoffPorPosicao(
  participantesOrdenados: string[]
): ConfrontoChave[] {
  validarParticipantes(participantesOrdenados)
  const n = participantesOrdenados.length
  const s = tamanhoChave(n)
  const order = ordemDeSeed(s)
  const confrontos: ConfrontoChave[] = []
  for (let i = 0; i < s / 2; i++) {
    const seedA = order[2 * i] // sempre o melhor seed do par (≤ s/2 < N ⇒ real)
    const seedB = order[2 * i + 1]
    const pA = participantesOrdenados[seedA - 1] // seedA ≤ s/2 < N ⇒ sempre existe
    const pB = seedB <= n ? participantesOrdenados[seedB - 1] : null // > N = bye
    confrontos.push({ posicao: i + 1, participante_1: pA, participante_2: pB })
  }
  return confrontos
}

export type PlayoffModo = "playoff_acesso" | "playout"
export type PlayoffEstilo = "vagas" | "extra"

/** Desfecho de uma chave de playoff (ids = vaga/slot do competitivo). */
export interface ResultadoChave {
  /** A chave resolveu o necessário (rodada `f` no 'vagas'; final no 'extra'). */
  decidida: boolean
  /** Ids que SOBEM (não-vazio só em playoff_acesso decidido). */
  sobem: Set<string>
  /** Ids que CAEM (não-vazio só em playout decidido). */
  caem: Set<string>
  /** Ids que PERMANECEM (todos os demais participantes da chave). */
  permanecem: Set<string>
}

/**
 * Deriva o desfecho de uma chave de playoff a partir das partidas persistidas.
 * PURO: a action mapeia vaga→id antes e id→competidor depois. Reúsa
 * `decidirConfronto` slot a slot (NUNCA recalcula agregado; W.O. e bye já
 * tratados lá; empate de jogo/agregado é barrado na persistência pelo trigger
 * `valida_resultado_mata_mata`, então uma chave jogada validamente sempre resolve).
 *
 * - estilo 'vagas': a chave joga SÓ `f = log2(playoffVagas/alvo)` rodadas.
 *   playoff_acesso: `alvo = vagas` sobreviventes SOBEM. playout: `alvo =
 *   playoffVagas - vagas` sobreviventes se SALVAM e os `vagas` eliminados CAEM.
 *   `decidida` = todas as partidas das rodadas 1..f encerradas e decididas.
 * - estilo 'extra': a chave vai à FINAL. playoff_acesso: campeão SOBE. playout:
 *   vice (perdedor da final) CAI. `decidida` = final decidida.
 * Todo participante sem desfecho favorável/desfavorável PERMANECE (cobertura total:
 * `|sobem|+|caem|+|permanecem| == nº de participantes da chave`).
 */
export function resultadoDaChave(
  partidas: PartidaJogada[],
  opts: {
    modo: PlayoffModo
    estilo: PlayoffEstilo
    vagas: number
    playoffVagas: number
  }
): ResultadoChave {
  const geradas = partidas.filter(
    (p): p is PartidaJogada & { rodada: number; posicao: number } =>
      p.rodada !== null && p.posicao !== null
  )
  const sobem = new Set<string>()
  const caem = new Set<string>()
  const permanecem = new Set<string>()
  const indecisa: ResultadoChave = { decidida: false, sobem, caem, permanecem }
  if (geradas.length === 0) return indecisa

  const base = rodadaBaseDaChave(geradas)
  const s = tamanhoChaveDasPartidas(geradas)
  const fases = totalFases(s)

  // Todos os participantes da chave: lados da FASE BASE (rodada base), sem nulos.
  const participantes = new Set<string>()
  for (const p of geradas) {
    if (p.rodada - base + 1 !== 1) continue
    if (p.participante_1) participantes.add(p.participante_1)
    if (p.participante_2) participantes.add(p.participante_2)
  }

  // Vencedores (vivos) após a fase relativa `faseRel`, decidindo cada slot
  // REGULAR via decidirConfronto (exclui o 3º lugar). null = fase não gerada ou
  // confronto ainda em aberto/empate (a chave não resolveu até ali).
  const vencedoresDaFase = (faseRel: number): Set<string> | null => {
    // Defensivo: faseRel fora de [1, fases] (ex.: alvo<=0 ⇒ f=Infinity) NUNCA pode
    // virar um Set vazio "decidido" — devolve null (indecisa). Espelha o guard do
    // schema/CHECK (defense-in-depth do motor puro).
    if (!Number.isInteger(faseRel) || faseRel < 1 || faseRel > fases) return null
    const slotsEsperados = s / 2 ** faseRel
    if (!Number.isInteger(slotsEsperados) || slotsEsperados < 1) return null
    const porSlot = new Map<number, PartidaJogada[]>()
    for (const p of geradas) {
      if (p.rodada - base + 1 !== faseRel) continue
      if (ehTerceiroLugar(faseRel, p.posicao, fases)) continue
      const lista = porSlot.get(p.posicao) ?? []
      lista.push(p)
      porSlot.set(p.posicao, lista)
    }
    const vivos = new Set<string>()
    for (let slot = 1; slot <= slotsEsperados; slot++) {
      const doSlot = porSlot.get(slot)
      if (!doSlot) return null
      const r = decidirConfronto(doSlot)
      if (!r) return null
      vivos.add(r.vencedor)
    }
    return vivos
  }

  if (opts.estilo === "vagas") {
    const alvo =
      opts.modo === "playoff_acesso" ? opts.vagas : opts.playoffVagas - opts.vagas
    // Guard: alvo precisa ser potência de 2 em (0, playoffVagas) — senão a chave
    // não para numa rodada exata. Config inválida ⇒ indecisa (não decide errado).
    if (
      !(alvo > 0 && alvo < opts.playoffVagas) ||
      !Number.isInteger(Math.log2(opts.playoffVagas / alvo))
    ) {
      return indecisa
    }
    const f = Math.round(Math.log2(opts.playoffVagas / alvo))
    const sobreviventes = vencedoresDaFase(f)
    if (!sobreviventes) return indecisa
    if (opts.modo === "playoff_acesso") {
      for (const id of sobreviventes) sobem.add(id)
      for (const id of participantes) if (!sobreviventes.has(id)) permanecem.add(id)
    } else {
      for (const id of participantes) {
        if (sobreviventes.has(id)) permanecem.add(id)
        else caem.add(id)
      }
    }
    return { decidida: true, sobem, caem, permanecem }
  }

  // estilo 'extra': resolve a FINAL (fase `fases`, posicao 1 — não o 3º lugar).
  const partidasFinal = geradas.filter(
    (p) => p.rodada - base + 1 === fases && p.posicao === 1
  )
  const resFinal = partidasFinal.length > 0 ? decidirConfronto(partidasFinal) : null
  if (!resFinal || resFinal.perdedor === null) return indecisa
  for (const id of participantes) {
    if (opts.modo === "playoff_acesso") {
      if (id === resFinal.vencedor) sobem.add(id)
      else permanecem.add(id)
    } else {
      if (id === resFinal.perdedor) caem.add(id)
      else permanecem.add(id)
    }
  }
  return { decidida: true, sobem, caem, permanecem }
}

/* -------------------------------------------------------------------------- */
/* Barragem cruzada (Fase 3): B confrontos 1×1 INDEPENDENTES (não-bracket)      */
/* -------------------------------------------------------------------------- */

/**
 * Gera as partidas da BARRAGEM `pares`: B confrontos 1×1 que se decidem na
 * PRÓPRIA rodada 1 — não há avanço de fase nem campeão único, cada par é
 * independente. Difere de `gerarFaseInicial` por NÃO tratar
 * `confrontos.length === 1` como final: uma barragem de UM par com ida-e-volta
 * DEVE gerar as duas pernas (não é a "final" de uma chave). A barragem não tem
 * byes (a action garante a paridade da zona); um lado nulo é defensivo.
 */
export function gerarBarragemPares(
  confrontos: ConfrontoChave[],
  idaEVolta: boolean
): PartidaChave[] {
  return confrontos.flatMap((c): PartidaChave[] => {
    if (c.participante_2 === null) {
      return [
        {
          rodada: 1,
          posicao: c.posicao,
          perna: null,
          participante_1: c.participante_1,
          participante_2: null,
          bye: true,
        },
      ]
    }
    if (idaEVolta) {
      return [
        {
          rodada: 1,
          posicao: c.posicao,
          perna: 1,
          participante_1: c.participante_1,
          participante_2: c.participante_2,
          bye: false,
        },
        {
          rodada: 1,
          posicao: c.posicao,
          perna: 2,
          participante_1: c.participante_2,
          participante_2: c.participante_1,
          bye: false,
        },
      ]
    }
    return [
      {
        rodada: 1,
        posicao: c.posicao,
        perna: null,
        participante_1: c.participante_1,
        participante_2: c.participante_2,
        bye: false,
      },
    ]
  })
}

/** Desfecho da barragem `pares`: cada par (posição) resolvido independente. */
export interface ResultadoBarragemPares {
  /** Todos os pares presentes têm vencedor decidido. */
  decidida: boolean
  /** posição do par → { vencedor, perdedor }. */
  vencedorPorPar: Map<number, ResultadoConfronto>
}

/**
 * Deriva o desfecho da barragem `pares` das partidas persistidas. PURO: agrupa
 * por `posicao` (cada par) e decide via `decidirConfronto` (reúsa W.O., agregado
 * sem gol-fora; empate barrado na persistência pelo trigger). `decidida` = TODOS
 * os pares resolvidos. A action mapeia vaga→competidor e cruza com as divisões
 * (quem é de d vs d+1) para montar o sobe/cai em `combinarFronteiraBarragem`.
 */
export function resultadoBarragemPares(
  partidas: PartidaJogada[]
): ResultadoBarragemPares {
  const geradas = partidas.filter(
    (p): p is PartidaJogada & { rodada: number; posicao: number } =>
      p.rodada !== null && p.posicao !== null
  )
  const vencedorPorPar = new Map<number, ResultadoConfronto>()
  if (geradas.length === 0) return { decidida: false, vencedorPorPar }

  const porSlot = new Map<number, PartidaJogada[]>()
  for (const p of geradas) {
    const lista = porSlot.get(p.posicao) ?? []
    lista.push(p)
    porSlot.set(p.posicao, lista)
  }

  let decidida = true
  for (const [posicao, doSlot] of porSlot) {
    const r = decidirConfronto(doSlot)
    if (!r || r.perdedor === null) {
      decidida = false
      continue
    }
    vencedorPorPar.set(posicao, r)
  }
  return { decidida, vencedorPorPar }
}
