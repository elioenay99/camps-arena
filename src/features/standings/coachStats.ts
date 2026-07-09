import { resultadoDoLado } from "@/features/standings/insights"

/**
 * Motor PURO da campanha de carreira do técnico (change add-perfil-tecnico-carreira).
 * Sem IO. Credita partidas por JANELA DE COMANDO (predicado meio-aberto) e agrega
 * a campanha (totais + fatia por competidor), REUSANDO `resultadoDoLado` do motor
 * de insights — a regra de W.O. (simples/duplo) NÃO é reimplementada aqui.
 */

/** Campanha agregada de um técnico (números de sempre ou fatia por clube). */
export interface Campanha {
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  golsPro: number
  golsContra: number
  saldo: number
  /** Aproveitamento 3-1-0 como métrica de EXIBIÇÃO (0 quando jogos = 0). */
  aproveitamento: number
}

/**
 * Uma partida já ATRIBUÍDA ao técnico (lado + janela resolvidos pelo fetcher).
 * Sem campo `wo`: `resultadoDoLado` deriva W.O. de `woDuplo`/`woVencedor`.
 */
export interface PartidaCreditada {
  competitorId: string
  lado: 1 | 2
  placar_1: number
  placar_2: number
  /** Lado vencedor num W.O. simples (1|2) ou `null` (jogo real / duplo W.O.). */
  woVencedorLado: 1 | 2 | null
  woDuplo: boolean
}

/**
 * Predicado de atribuição por janela de comando — MEIO-ABERTO NO TOPO:
 * `(ini==null || rodada>=ini) && (fim==null || rodada<fim)`. A fronteira da troca
 * (`rodada_fim == rodada_inicio == v_rodada`) fica com QUEM ASSUMIU (topo
 * exclusivo), sem duplicar nem perder a partida. `rodada` NULL é DEFENSIVO: só
 * passa numa tenure TOTALMENTE ABERTA (ini e fim nulos) — não ocorre em partida
 * creditável real (toda partida creditável tem `rodada` não-nula).
 */
export function partidaNaJanela(
  rodada: number | null,
  ini: number | null,
  fim: number | null
): boolean {
  const acimaDoInicio = ini == null || (rodada != null && rodada >= ini)
  const abaixoDoFim = fim == null || (rodada != null && rodada < fim)
  return acimaDoInicio && abaixoDoFim
}

interface Acumulado {
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  golsPro: number
  golsContra: number
}

function acumuladoVazio(): Acumulado {
  return { jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsContra: 0 }
}

function finalizar(a: Acumulado): Campanha {
  const saldo = a.golsPro - a.golsContra
  const aproveitamento = a.jogos
    ? Math.round(((3 * a.vitorias + a.empates) / (3 * a.jogos)) * 100)
    : 0
  return { ...a, saldo, aproveitamento }
}

/**
 * Agrega a campanha de sempre (total) e a fatia por `competitor_id`, sobre as
 * partidas já creditadas. Reusa `resultadoDoLado` via um shim
 * `PartidaCronoElegivel` (`participante_1='1'`/`participante_2='2'`, `woVencedor`
 * re-chaveado para o lado 1|2). Invariante: a soma das fatias por clube é igual ao
 * total (cada partida pertence a exatamente um competidor).
 */
export function agregarCampanhaTecnico(partidas: PartidaCreditada[]): {
  total: Campanha
  porClube: Map<string, Campanha>
} {
  const total = acumuladoVazio()
  const porClube = new Map<string, Acumulado>()

  for (const p of partidas) {
    const shim = {
      participante_1: "1",
      participante_2: "2",
      placar_1: p.placar_1,
      placar_2: p.placar_2,
      status: "encerrada" as const,
      woVencedor:
        p.woVencedorLado === 1 ? "1" : p.woVencedorLado === 2 ? "2" : null,
      woDuplo: p.woDuplo,
      rodada: null,
      criadaEm: "",
      id: "",
    }
    const r = resultadoDoLado(shim, p.lado)

    let clube = porClube.get(p.competitorId)
    if (!clube) {
      clube = acumuladoVazio()
      porClube.set(p.competitorId, clube)
    }

    for (const acc of [total, clube]) {
      acc.jogos += 1
      if (r.resultado === "V") acc.vitorias += 1
      else if (r.resultado === "E") acc.empates += 1
      else acc.derrotas += 1
      // W.O. (simples ou duplo) não credita gols (mesma regra do motor).
      if (!r.wo) {
        const meu = p.lado === 1 ? p.placar_1 : p.placar_2
        const dele = p.lado === 1 ? p.placar_2 : p.placar_1
        acc.golsPro += meu
        acc.golsContra += dele
      }
    }
  }

  const porClubeFinal = new Map<string, Campanha>()
  for (const [id, acc] of porClube) porClubeFinal.set(id, finalizar(acc))
  return { total: finalizar(total), porClube: porClubeFinal }
}
