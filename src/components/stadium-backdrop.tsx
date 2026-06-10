/**
 * Atmosfera de "estádio" — camadas decorativas FIXAS atrás do conteúdo:
 * holofote do primário (respira devagar) + gramado em perspectiva + grão de
 * textura. Recolore por tema (roxo no dark, verde+amarelo no light).
 * Puramente cosmético: `aria-hidden`, `pointer-events-none`, `-z-10`. Usado no
 * shell autenticado e nas telas de auth para dar a profundidade que faltava ao
 * interior do app (era preto chapado). Estilos em globals.css; o
 * prefers-reduced-motion zera a respiração.
 */
export function StadiumBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="stadium-spotlight animate-breathe absolute inset-0" />
      <div className="pitch-grid absolute inset-0" />
      <div className="grain absolute inset-0" />
    </div>
  )
}
