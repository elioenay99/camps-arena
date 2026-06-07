/**
 * Motor PURO da fase de grupos — zero IO, mesma filosofia dos demais motores.
 * COMPÕE os motores existentes em vez de duplicá-los: o round-robin de cada
 * grupo vem de `gerarTabelaLiga`; a classificação de cada grupo vem de
 * `computeStandings` sobre o subconjunto; a chave dos classificados usa os
 * tipos/geração do knockout (`ConfrontoChave`/`gerarFaseInicial`).
 *
 * Formatos atendidos: 'grupos_mata_mata' (Copa — G grupos) e 'fase_liga'
 * (Champions — caso G = 1 do MESMO motor).
 *
 * Determinismo: toda aleatoriedade é INJETADA via `RandInt` (sorteio de
 * grupos e desempate da linha de corte); os testes usam geradores fixos.
 */

import {
  gerarTabelaLiga,
} from "@/features/league/gerarTabelaLiga"
import {
  embaralhar,
  type ConfrontoChave,
  type RandInt,
} from "@/features/knockout/gerarChaveMataMata"
import {
  computeStandings,
  type PartidaClassificavel,
  type RegrasPontuacao,
} from "@/features/standings/computeStandings"

/**
 * Totais de classificados que produzem chave completa (sem bye pós-grupos).
 * Nota: 32 é hoje INALCANÇÁVEL (K < menor grupo + teto de 32 participantes
 * implicam total máximo 16); fica na lista por completude — se o teto de
 * participantes subir, o valor passa a valer sem mudança aqui.
 */
export const TOTAIS_CHAVE_VALIDOS = [2, 4, 8, 16, 32] as const

/** Quantidades de grupos suportadas (G·K potência de 2 ⇒ G potência de 2). */
export const GRUPOS_VALIDOS = [1, 2, 4, 8] as const

export type ModoDistribuicao = "sorteio" | "potes" | "manual"

/** Partida da fase de grupos a inserir (a action acrescenta tournament_id). */
export interface PartidaGrupo {
  grupo: number
  rodada: number
  participante_1: string
  participante_2: string
}

/** Rótulo do grupo pela convenção do futebol (1 → "Grupo A"). */
export function rotuloGrupo(numero: number): string {
  return `Grupo ${String.fromCharCode(64 + numero)}`
}

function validarParticipantes(participantes: string[]): void {
  if (new Set(participantes).size !== participantes.length) {
    throw new Error("Participantes duplicados na montagem dos grupos.")
  }
}

/**
 * Valida a geometria G/K contra o N de participantes. Regras: G suportado;
 * G·K potência de 2 suportada (chave completa, sem bye pós-grupos); cada
 * grupo precisa de pelo menos 2 (há jogo) e K precisa ser MENOR que o menor
 * grupo (classificar todos não é eliminatória).
 */
export function validarGeometria(
  qtdParticipantes: number,
  qtdGrupos: number,
  classificadosPorGrupo: number
): void {
  if (!(GRUPOS_VALIDOS as readonly number[]).includes(qtdGrupos)) {
    throw new Error(
      `Quantidade de grupos inválida — use ${GRUPOS_VALIDOS.join(", ")}.`
    )
  }
  const total = qtdGrupos * classificadosPorGrupo
  if (!(TOTAIS_CHAVE_VALIDOS as readonly number[]).includes(total)) {
    throw new Error(
      `Grupos × classificados deve totalizar ${TOTAIS_CHAVE_VALIDOS.join(", ")} (chave completa) — ${qtdGrupos} × ${classificadosPorGrupo} = ${total}.`
    )
  }
  const menorGrupo = Math.floor(qtdParticipantes / qtdGrupos)
  if (menorGrupo < 2) {
    throw new Error(
      `${qtdParticipantes} participantes não preenchem ${qtdGrupos} grupos (mínimo 2 por grupo).`
    )
  }
  if (classificadosPorGrupo >= menorGrupo) {
    throw new Error(
      `Com grupos de ${menorGrupo}, classificam no máximo ${menorGrupo - 1} por grupo.`
    )
  }
}

/** Distribui em G grupos equilibrados (diferença máxima 1) na ordem dada. */
function distribuir(ordenados: string[], qtdGrupos: number): string[][] {
  const grupos: string[][] = Array.from({ length: qtdGrupos }, () => [])
  ordenados.forEach((p, i) => grupos[i % qtdGrupos].push(p))
  return grupos
}

/** Modo SORTEIO: embaralha e distribui round-robin (equilíbrio garantido). */
export function montarGruposSorteio(
  participantes: string[],
  qtdGrupos: number,
  randInt: RandInt
): string[][] {
  validarParticipantes(participantes)
  return distribuir(embaralhar(participantes, randInt), qtdGrupos)
}

/**
 * Modo POTES: exatamente G cabeças de chave, UMA por grupo (ordem das
 * cabeças sorteada); os demais são sorteados e distribuídos em sequência.
 */
export function montarGruposPotes(
  cabecas: string[],
  demais: string[],
  qtdGrupos: number,
  randInt: RandInt
): string[][] {
  validarParticipantes([...cabecas, ...demais])
  if (cabecas.length !== qtdGrupos) {
    throw new Error(
      `Marque exatamente ${qtdGrupos} cabeças de chave (uma por grupo).`
    )
  }
  const ordemCabecas = embaralhar(cabecas, randInt)
  const grupos = ordemCabecas.map((cabeca) => [cabeca])
  embaralhar(demais, randInt).forEach((p, i) =>
    grupos[i % qtdGrupos].push(p)
  )
  return grupos
}

/**
 * Modo MANUAL: o dono atribui cada participante a um grupo. Valida partição
 * exata e equilíbrio (±1) — grupos muito desiguais quebrariam a prévia e o
 * corte K.
 */
export function montarGruposManual(
  atribuicao: string[][],
  participantes: string[]
): string[][] {
  validarParticipantes(participantes)
  const usados = atribuicao.flat()
  if (new Set(usados).size !== usados.length) {
    throw new Error("Cada participante entra em um único grupo.")
  }
  const confirmados = new Set(participantes)
  if (
    usados.length !== participantes.length ||
    !usados.every((p) => confirmados.has(p))
  ) {
    throw new Error(
      "Distribua todos os participantes confirmados (e somente eles) nos grupos."
    )
  }
  const tamanhos = atribuicao.map((g) => g.length)
  if (Math.max(...tamanhos) - Math.min(...tamanhos) > 1) {
    throw new Error("Os grupos precisam ser equilibrados (diferença máxima de 1).")
  }
  return atribuicao.map((g) => [...g])
}

/**
 * Partidas de TODOS os grupos: round-robin interno via `gerarTabelaLiga`
 * (folga em grupo ímpar, espelho em ida-e-volta — tudo herdado). `rodada` é
 * a rodada interna do grupo: grupos correm em paralelo (G1 R1 e G2 R1
 * coexistem; pares distintos nunca colidem no índice de par único).
 */
export function gerarPartidasGrupos(
  grupos: string[][],
  idaEVolta: boolean
): PartidaGrupo[] {
  return grupos.flatMap((membros, i) =>
    gerarTabelaLiga(membros, idaEVolta).flatMap((r) =>
      r.confrontos.map(([p1, p2]) => ({
        grupo: i + 1,
        rodada: r.rodada,
        participante_1: p1,
        participante_2: p2,
      }))
    )
  )
}

/** Linha de partida persistida da fase de grupos (shape do banco). */
export interface PartidaGrupoJogada extends PartidaClassificavel {
  grupo: number | null
  rodada: number | null
}

export interface ClassificacaoDosGrupos {
  /** Por grupo (índice 0 = grupo 1), em ordem 1º..Kº. */
  classificados: string[][]
  /** Houve sorteio na linha de corte de algum grupo (aviso na UI). */
  sorteioUsado: boolean
}

/**
 * Classifica cada grupo via `computeStandings` (subconjunto) e corta os K
 * primeiros. Empate de POSIÇÃO cruzando a linha de corte (o motor divide
 * posição em empate persistente) é resolvido por SORTEIO entre os empatados
 * da fronteira — critério final pós-CBF, decidido pelo usuário — e
 * sinalizado para a UI avisar.
 */
export function classificarGrupos(
  partidas: PartidaGrupoJogada[],
  regras: RegrasPontuacao,
  qtdGrupos: number,
  classificadosPorGrupo: number,
  randInt: RandInt
): ClassificacaoDosGrupos {
  const classificados: string[][] = []
  let sorteioUsado = false

  for (let g = 1; g <= qtdGrupos; g++) {
    const doGrupo = partidas.filter((p) => p.grupo === g)
    const linhas = computeStandings(regras, doGrupo)
    if (linhas.length < classificadosPorGrupo + 1) {
      // K < tamanho do grupo é validado no Iniciar; linhas só faltam se
      // alguém não jogou — grupos completos garantem todos nas standings.
      throw new Error(
        `O grupo ${g} não tem classificação completa para o corte.`
      )
    }

    const corte: string[] = []
    let i = 0
    while (corte.length < classificadosPorGrupo) {
      // Bloco de posição dividida (empate persistente do motor).
      const posicao = linhas[i].posicao
      const bloco = []
      while (i < linhas.length && linhas[i].posicao === posicao) {
        bloco.push(linhas[i].participanteId)
        i++
      }
      const vagas = classificadosPorGrupo - corte.length
      if (bloco.length <= vagas) {
        corte.push(...bloco)
      } else {
        // O bloco cruza a linha de corte: sorteio entre os empatados.
        corte.push(...embaralhar(bloco, randInt).slice(0, vagas))
        sorteioUsado = true
      }
    }
    classificados.push(corte)
  }

  return { classificados, sorteioUsado }
}

/**
 * Ordem de bracket dos pares (rank 1 separado do rank 2 em metades opostas;
 * recursão clássica de seeding): [1] → [1,2] → [1,4,2,3] → [1,8,4,5,2,7,3,6].
 */
export function ordemBracket(nPares: number): number[] {
  let ordem = [1]
  while (ordem.length < nPares) {
    const dobro = ordem.length * 2
    ordem = ordem.flatMap((r) => [r, dobro + 1 - r])
  }
  return ordem
}

/**
 * Cruza os classificados num chaveamento determinístico, devolvendo os
 * confrontos da 1ª fase da chave (tipo do knockout — sem byes, chave
 * completa por construção):
 * - G = 1 (fase de liga): pares seed i × seed K+1−i, posicionados pela ordem
 *   de bracket (1 e 2 em metades opostas — padrão Champions).
 * - G ≥ 2 (Copa): grupos em pares adjacentes (A,B), (C,D)…; confrontos
 *   A_i × B_{K+1−i}; i ímpar numa metade da chave, i par na outra (lados
 *   invertidos nos pares para alternar o "mando"). Separação de grupos: com
 *   K = 2 mesmos grupos só se reencontram na final; com K ≥ 4 dois
 *   classificados do MESMO grupo podem se cruzar a partir da 2ª fase —
 *   inerente a poucos grupos com muitos classificados (a chave separa o
 *   máximo possível).
 */
export function cruzarClassificados(
  classificados: string[][]
): ConfrontoChave[] {
  const qtdGrupos = classificados.length
  const k = classificados[0]?.length ?? 0
  if (!classificados.every((g) => g.length === k) || k < 1) {
    throw new Error("Classificação incompleta para o cruzamento.")
  }
  const total = qtdGrupos * k
  if (!(TOTAIS_CHAVE_VALIDOS as readonly number[]).includes(total)) {
    throw new Error("Total de classificados inválido para a chave.")
  }

  if (qtdGrupos === 1) {
    const seeds = classificados[0]
    const pares: [string, string][] = Array.from({ length: k / 2 }, (_, i) => [
      seeds[i],
      seeds[k - 1 - i],
    ])
    const ordem = ordemBracket(k / 2)
    return ordem.map((rank, slot) => ({
      posicao: slot + 1,
      participante_1: pares[rank - 1][0],
      participante_2: pares[rank - 1][1],
    }))
  }

  // G >= 2: metade 1 recebe os confrontos de i ímpar de cada par de grupos,
  // metade 2 os de i par (com lados invertidos).
  const metade1: ConfrontoChave[] = []
  const metade2: ConfrontoChave[] = []
  for (let p = 0; p < qtdGrupos; p += 2) {
    const a = classificados[p]
    const b = classificados[p + 1]
    for (let i = 1; i <= k; i++) {
      const confronto: [string, string] = [a[i - 1], b[k - i]]
      if (i % 2 === 1) {
        metade1.push({
          posicao: 0,
          participante_1: confronto[0],
          participante_2: confronto[1],
        })
      } else {
        metade2.push({
          posicao: 0,
          participante_1: confronto[1],
          participante_2: confronto[0],
        })
      }
    }
  }
  return [...metade1, ...metade2].map((c, i) => ({ ...c, posicao: i + 1 }))
}

export interface PreviaGrupos {
  jogosGrupos: number
  rodadasGrupos: number
  jogosChave: number
  fasesChave: number
}

/**
 * Prévia do painel de início — fórmulas fechadas das MESMAS fontes dos
 * motores (C(n,2) por grupo via aritmética da liga; chave completa de G·K
 * sem byes via aritmética do knockout).
 */
export function previaGrupos(
  qtdParticipantes: number,
  qtdGrupos: number,
  classificadosPorGrupo: number,
  idaEVolta: boolean,
  terceiroLugar: boolean
): PreviaGrupos {
  const turnos = idaEVolta ? 2 : 1
  const base = Math.floor(qtdParticipantes / qtdGrupos)
  const sobras = qtdParticipantes % qtdGrupos
  let jogosGrupos = 0
  let rodadasGrupos = 0
  for (let g = 0; g < qtdGrupos; g++) {
    const tam = base + (g < sobras ? 1 : 0)
    jogosGrupos += ((tam * (tam - 1)) / 2) * turnos
    const rodadas = (tam % 2 === 0 ? tam - 1 : tam) * turnos
    rodadasGrupos = Math.max(rodadasGrupos, rodadas)
  }

  const total = qtdGrupos * classificadosPorGrupo
  // Chave completa (sem bye): jogos = total-1 confrontos; ida-e-volta dobra
  // os não-finais; +1 com 3º lugar (sempre há dois perdedores reais de semi
  // quando total >= 4 — não existe bye pós-grupos).
  const jogosChave =
    (idaEVolta ? (total - 2) * 2 + 1 : total - 1) +
    (terceiroLugar && total >= 4 ? 1 : 0)
  return {
    jogosGrupos,
    rodadasGrupos,
    jogosChave,
    fasesChave: Math.round(Math.log2(total)),
  }
}
