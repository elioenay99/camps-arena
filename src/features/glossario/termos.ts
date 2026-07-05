/**
 * Catálogo único das explicações dos termos de nicho do Goliseu (fonte de
 * verdade da copy da ajuda contextual). Cada âncora referencia um termo por `id`
 * — a cópia nunca é duplicada nos pontos de uso.
 */
export type TermoId =
  | "piramide"
  | "vaga"
  | "tecnico"
  | "promedio"
  | "fase-de-liga"
  | "barragem"
  | "copa-imortal"

export interface TermoDef {
  /** Nome exibível do termo (compõe o `aria-label` do gatilho de ajuda). */
  rotulo: string
  /** Explicação em UMA frase (pt-BR). */
  explicacao: string
}

export const TERMOS: Record<TermoId, TermoDef> = {
  piramide: {
    rotulo: "Pirâmide",
    explicacao:
      "Divisões empilhadas (Série A, B, C…) com acesso e rebaixamento entre elas.",
  },
  vaga: {
    rotulo: "Vaga",
    explicacao:
      "Cada clube do campeonato é uma vaga; você convida alguém pra assumi-la.",
  },
  tecnico: {
    rotulo: "Técnico",
    explicacao:
      "Quem comanda um clube: assume a vaga por convite e pode ser substituído.",
  },
  promedio: {
    rotulo: "Promédio",
    // POR JOGO (não por temporada): o cálculo real (leaguePyramidSchema +
    // CompetidorAgregados, toFixed(3)) é pontos por jogo.
    explicacao:
      "Média de pontos por jogo (estilo argentino) — compara quem jogou quantidades diferentes de jogos.",
  },
  "fase-de-liga": {
    rotulo: "Fase de liga",
    explicacao:
      "Todos jogam numa tabela única e os melhores avançam pro mata-mata (estilo Champions).",
  },
  barragem: {
    rotulo: "Barragem",
    explicacao:
      "Confronto extra entre clubes de zonas intermediárias pra decidir quem sobe/cai.",
  },
  "copa-imortal": {
    rotulo: "Copa imortal",
    explicacao:
      "Uma copa que continua edição após edição, guardando o histórico.",
  },
}
