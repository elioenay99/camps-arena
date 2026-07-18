import { IDENTIDADES } from "@/features/demo/fixtures/identidades"
import { TORNEIO_LIGA } from "@/features/demo/fixtures/torneioLiga"
import { TORNEIO_MATA_MATA } from "@/features/demo/fixtures/torneioMataMata"
import { TORNEIOS_EXTRAS } from "@/features/demo/fixtures/torneiosExtras"
import { VITRINE } from "@/features/demo/fixtures/vitrine"

import type { DemoState } from "./demoReducer"

/**
 * Snapshot inicial da demonstração (o "seed"). Determinístico — nenhum
 * `Math.random`/`Date.now` no caminho de montagem — para hidratação SSR estável e
 * testes reprodutíveis. A ação `REINICIAR` volta a este estado.
 */
export function criarEstadoInicial(): DemoState {
  return {
    identidades: IDENTIDADES,
    torneios: [TORNEIO_LIGA, TORNEIO_MATA_MATA, ...TORNEIOS_EXTRAS],
    vitrine: VITRINE.map((v) => ({ ...v })),
    partidasAtivas: [],
    perfil: "visitante",
  }
}
