/**
 * Escada disciplinar de W.O. SEGUIDOS por técnico (change add-contador-wo-tecnico).
 *
 * Fonte da verdade da regra: um fold POSICIONAL sobre os eventos disciplinares do
 * técnico numa competição, JÁ ordenados por rodada (ordem total garantida pela RPC
 * `sequencia_disciplina_torneio`). O módulo é puro — sem I/O — para ser testável
 * exaustivamente e reusável no fetcher.
 *
 * Regra (decisões do dono):
 *  - `wo_loss` (técnico ausente) NÃO-perdoado SOMA 1 ao streak;
 *  - `wo_loss` perdoado ZERA (baseline: o ADM declarou "conta limpa até aqui");
 *  - PRESENTE (`jogou` OU `wo_win` — venceu por W.O., o adversário faltou) com streak
 *    ABAIXO do limite ZERA (perdão automático); a partir do limite NÃO zera (a trava
 *    disciplinar é o ponto da feature — só o ADM resolve acima do limite).
 */

/** Streak a partir do qual o perdão automático TRAVA e surgem as ações do ADM. */
export const LIMITE_WO_SEGUIDOS = 3

/** Um evento disciplinar de uma partida encerrada do técnico, por rodada. */
export type EventoWo = {
  rodada: number | null
  /** `wo_loss` = ausente; `wo_win`/`jogou` = presente. */
  tipo: "wo_loss" | "wo_win" | "jogou"
  /** true = este W.O.-derrota foi perdoado pelo ADM (baseline em `wo_perdoes`). */
  perdoado: boolean
}

/**
 * Streak corrente de W.O. seguidos. `eventos` DEVE vir ordenado por rodada asc
 * (ordem total) — a RPC garante isso; o fold depende da posição.
 */
export function calcularStreakWo(eventos: EventoWo[]): number {
  let streak = 0
  for (const ev of eventos) {
    if (ev.tipo === "wo_loss") {
      // Ausente: perdão zera o baseline; senão soma mais uma ausência consecutiva.
      if (ev.perdoado) streak = 0
      else streak += 1
    } else {
      // Presente (jogou / wo_win): auto-perdão só abaixo do limite; acima, TRAVA.
      if (streak < LIMITE_WO_SEGUIDOS) streak = 0
    }
  }
  return streak
}
