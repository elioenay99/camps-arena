import type {
  PartidaAberta,
  PartidaEncerrada,
} from "@/features/standings/data/getTournamentClassificacao"
import type { LadoRodadaTexto } from "@/lib/whatsapp"

export interface ConfrontoTexto {
  lado1: LadoRodadaTexto
  lado2: LadoRodadaTexto
}

/**
 * Adapter (change add-compartilhar-rodada): confrontos de uma rodada para o
 * TEXTO do compartilhamento, a partir dos dados JÁ carregados na página — sem
 * query extra. Mescla abertas + encerradas da rodada (casa com a imagem, que
 * traz todas) e deduplica a 2ª perna de ida-e-volta (`perna === 2`). O
 * comandante vem do técnico da vaga; o celular (p/ o wa.me) só existe nas
 * abertas (encerrada não traz contato → sai só com nome).
 */
export function confrontosTextoDaRodada(
  rodada: number,
  abertas: PartidaAberta[],
  encerradas: PartidaEncerrada[]
): ConfrontoTexto[] {
  const deAbertas = abertas
    .filter((p) => p.rodada === rodada && p.perna !== 2)
    .map((p) => ({
      lado1: {
        clube: p.nome_1,
        comandante: p.tecnico_1?.nome ?? null,
        celular: p.participante_1?.celular ?? null,
      },
      lado2: {
        clube: p.nome_2,
        comandante: p.tecnico_2?.nome ?? null,
        celular: p.participante_2?.celular ?? null,
      },
    }))
  const deEncerradas = encerradas
    .filter((p) => p.rodada === rodada && p.perna !== 2)
    .map((p) => ({
      lado1: { clube: p.nome_1, comandante: p.tecnico_1?.nome ?? null, celular: null },
      lado2: { clube: p.nome_2, comandante: p.tecnico_2?.nome ?? null, celular: null },
    }))
  return [...deAbertas, ...deEncerradas]
}
