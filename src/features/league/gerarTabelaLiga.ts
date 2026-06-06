/**
 * Motor PURO de geração de tabela de liga (round-robin) — zero IO, mesma
 * filosofia do computeStandings: a action busca participantes, chama o motor
 * e insere o resultado; a UI usa o MESMO motor para a prévia (fonte única).
 *
 * Método do círculo: fixa o primeiro participante e rotaciona os demais a
 * cada rodada. N par → N-1 rodadas com N/2 jogos; N ímpar → adiciona um
 * "fantasma" (folga): N rodadas, quem cai contra o fantasma descansa (a folga
 * NÃO vira partida no banco).
 *
 * Determinismo: o motor não embaralha — a ordem dos confrontos é função da
 * ordem de entrada. O CHAMADOR ordena os participantes por code-point do id
 * (mesma decisão do computeStandings: determinístico cross-locale).
 */

/** Limite de participantes de uma liga (20 em ida-e-volta = 380 partidas). */
export const LIGA_MAX_PARTICIPANTES = 20

export interface RodadaLiga {
  /** 1-based; em ida-e-volta o segundo turno continua a numeração. */
  rodada: number
  /** Pares [participante_1, participante_2] da rodada. */
  confrontos: [string, string][]
}

/** Sentinela interna da folga (N ímpar). Nunca aparece no resultado. */
const FANTASMA = null

/**
 * Gera as rodadas da liga. Lança em entrada inválida (menos de 2, acima do
 * limite ou ids duplicados) — a action converte em mensagem de formulário.
 */
export function gerarTabelaLiga(
  participantes: string[],
  idaEVolta: boolean
): RodadaLiga[] {
  if (participantes.length < 2) {
    throw new Error("A liga precisa de pelo menos 2 participantes.")
  }
  if (participantes.length > LIGA_MAX_PARTICIPANTES) {
    throw new Error(
      `A liga aceita no máximo ${LIGA_MAX_PARTICIPANTES} participantes.`
    )
  }
  if (new Set(participantes).size !== participantes.length) {
    throw new Error("Participantes duplicados na geração da liga.")
  }

  // N ímpar ganha o fantasma; confronto com ele é a folga da rodada.
  const circulo: (string | typeof FANTASMA)[] = [...participantes]
  if (circulo.length % 2 !== 0) {
    circulo.push(FANTASMA)
  }

  const n = circulo.length
  const rodadasPorTurno = n - 1
  const ida: RodadaLiga[] = []

  // Posição 0 fixa; as demais rotacionam em sentido horário a cada rodada.
  const fixo = circulo[0]
  let giro = circulo.slice(1)

  for (let r = 1; r <= rodadasPorTurno; r++) {
    const ordem = [fixo, ...giro]
    const confrontos: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = ordem[i]
      const b = ordem[n - 1 - i]
      if (a === FANTASMA || b === FANTASMA) continue // folga
      // Alterna o mando nas rodadas pares para o fixo não ser sempre o lado 1.
      // O equilíbrio é parcial em turno único (mando é cosmético no produto);
      // em ida-e-volta fica perfeito (cada par joga uma vez de cada lado).
      confrontos.push(r % 2 === 0 && i === 0 ? [b, a] : [a, b])
    }
    ida.push({ rodada: r, confrontos })
    giro = [giro[giro.length - 1], ...giro.slice(0, -1)]
  }

  if (!idaEVolta) {
    return ida
  }

  // Segundo turno: espelho do primeiro com os lados invertidos e numeração
  // contínua (rodada R do returno = rodadasPorTurno + R).
  const volta: RodadaLiga[] = ida.map((r) => ({
    rodada: rodadasPorTurno + r.rodada,
    confrontos: r.confrontos.map(([a, b]): [string, string] => [b, a]),
  }))

  return [...ida, ...volta]
}

export interface PreviaLiga {
  partidas: number
  rodadas: number
}

/**
 * Prévia para a UI (painel "Iniciar torneio"): quantidades SEM gerar a
 * estrutura. Fórmulas fechadas — C(n,2) por turno; rodadas n-1 (par) ou n
 * (ímpar, com folga) por turno.
 */
export function previaLiga(qtdParticipantes: number, idaEVolta: boolean): PreviaLiga {
  if (qtdParticipantes < 2) {
    return { partidas: 0, rodadas: 0 }
  }
  const turnos = idaEVolta ? 2 : 1
  const porTurno = (qtdParticipantes * (qtdParticipantes - 1)) / 2
  const rodadasPorTurno =
    qtdParticipantes % 2 === 0 ? qtdParticipantes - 1 : qtdParticipantes
  return { partidas: porTurno * turnos, rodadas: rodadasPorTurno * turnos }
}
