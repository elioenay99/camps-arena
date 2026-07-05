/**
 * Densidade da classificação — funções PURAS (sem IO, sem matchMedia) para serem
 * exaustivamente testáveis. `ClassificacaoResponsiva` (client) as consome com o
 * `viewportMobile` lido do `matchMedia` pós-hidratação. change
 * add-classificacao-a11y-responsiva.
 */

export type Modo = "rolar" | "caber"

/**
 * Modo inicial derivado do viewport (F3): no mobile a classificação abre
 * resumida ("caber"); no desktop, rolando ("rolar"). Usado só quando não há
 * preferência salva.
 */
export function deriveModoInicial(viewportMobile: boolean): Modo {
  return viewportMobile ? "caber" : "rolar"
}

/**
 * Estado COMPACTO = oculta as estatísticas secundárias + habilita expandir-linha.
 * Regra dura: só no MOBILE. O desktop NUNCA é compacto (todas as colunas ficam
 * visíveis), mesmo em "caber" — lá "caber" apenas compacta a tipografia.
 */
export function deriveCompacto(viewportMobile: boolean, modo: Modo): boolean {
  return viewportMobile && modo === "caber"
}
