/**
 * Agregado POSIÇÃO-NO-GRUPO de uma fase de grupos (Fase 5.2). Puro, zero IO.
 *
 * Numa divisão de pirâmide formato `grupos_mata_mata`, o sobe/cai é decidido pela
 * FASE DE GRUPOS (o mata-mata só coroa o campeão). Como times de grupos diferentes
 * nunca se enfrentaram, somar pontos cru geraria empates sem critério esportivo
 * (cluster de posição dividida → corte vira sorteio). Em vez disso, ordenamos por
 * POSIÇÃO-NO-GRUPO ("melhores segundos"): todos os 1ºs de grupo acima de todos os
 * 2ºs, etc.; dentro do mesmo nível, por pontos/saldo/gols pró; e o `participanteId`
 * único como chave final ⇒ ORDEM TOTAL estrita, sem sorteio (mesmo padrão de
 * `rankearPorPromedio`).
 */

/** Linha de um grupo com a posição INTERNA (1..tamGrupo) e os agregados do grupo. */
export interface LinhaAgregavel {
  participanteId: string
  /** Posição DENTRO do grupo (empatados dividem). */
  posicao: number
  pontos: number
  saldo: number
  golsPro: number
}

/**
 * Recebe as linhas POR GRUPO (cada grupo já classificado por `computeStandings`,
 * com `posicao` interna) e devolve UMA lista com a `posicao` GLOBAL reatribuída
 * 1..N (ordem total única). Os demais campos de cada linha são preservados — em
 * particular `pontos`/`jogos` seguem SÓ da fase de grupos (o mata-mata nunca entra).
 */
export function rankearAgregadoGrupos<T extends LinhaAgregavel>(
  gruposLinhas: readonly (readonly T[])[]
): T[] {
  const todas = gruposLinhas.flatMap((linhas) =>
    linhas.map((linha) => ({ linha, posicaoNoGrupo: linha.posicao }))
  )
  todas.sort((a, b) => {
    if (a.posicaoNoGrupo !== b.posicaoNoGrupo) return a.posicaoNoGrupo - b.posicaoNoGrupo
    if (b.linha.pontos !== a.linha.pontos) return b.linha.pontos - a.linha.pontos
    if (b.linha.saldo !== a.linha.saldo) return b.linha.saldo - a.linha.saldo
    if (b.linha.golsPro !== a.linha.golsPro) return b.linha.golsPro - a.linha.golsPro
    return a.linha.participanteId < b.linha.participanteId
      ? -1
      : a.linha.participanteId > b.linha.participanteId
        ? 1
        : 0
  })
  return todas.map((item, i) => ({ ...item.linha, posicao: i + 1 }))
}
