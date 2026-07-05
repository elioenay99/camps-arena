/**
 * Deriva os flags do estado-vazio de partidas ativas a partir dos torneios do
 * usuário. Função PURA (sem I/O) para blindar a inversão de condição — o bug
 * mais provável — com teste barato.
 *
 * - `semTorneios`: não organiza nem participa de nenhum torneio.
 * - `temAvulsoAberto`: tem ao menos um torneio avulso aberto (contagem vinda de
 *   `getOwnTournaments`, mesma fonte do seletor de `/dashboard/partidas/nova` —
 *   paridade garante que "Nova partida" apareça exatamente quando há opção).
 */
export interface EmptyStateFlags {
  semTorneios: boolean
  temAvulsoAberto: boolean
}

export function deriveEmptyStateFlags(input: {
  organizoCount: number
  participoCount: number
  avulsosAbertosCount: number
}): EmptyStateFlags {
  return {
    semTorneios: input.organizoCount === 0 && input.participoCount === 0,
    temAvulsoAberto: input.avulsosAbertosCount > 0,
  }
}
