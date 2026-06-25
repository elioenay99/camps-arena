import type { VagaDoTorneio } from "@/features/tournament/data/getVagasDoTorneio"
import type { TimeListaTexto } from "@/lib/whatsapp"

/**
 * Adapta as VAGAS do torneio + o mapa de celulares (RPC gated `celulares_de_contato`) para
 * os times do texto de compartilhamento (`mensagemListaTimes`). Irmã de
 * `confrontosTextoDaRodada`.
 *
 * Regra do ❌ IGUAL à rodada (decisão do dono): só vaga SEM técnico (órfã/por-nome) vira ❌
 * (`comandante: null`). Técnico PRESENTE nunca vira ❌ — sem nome cadastrado cai no fallback
 * "Sem nome" (espelha a VagasSection, que renderiza "téc. Sem nome"). O celular vem do mapa
 * por id do técnico (ausente ⇒ null ⇒ o link `wa.me` some).
 */
export function listaTimesTexto(
  vagas: VagaDoTorneio[],
  celularPorId: Map<string, string | null>
): TimeListaTexto[] {
  return vagas.map((vaga) => ({
    clube: vaga.clube,
    comandante: vaga.tecnico ? vaga.tecnico.nome?.trim() || "Sem nome" : null,
    celular: vaga.tecnico ? celularPorId.get(vaga.tecnico.id) ?? null : null,
  }))
}
