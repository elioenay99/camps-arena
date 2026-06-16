/**
 * Escudo da marca Goliseu (o "G" no hexágono do `icon.svg`), como SVG inline que
 * herda `currentColor` — assim ganha cor e glow pelo contexto (text-primary,
 * etc.). Decorativo: `aria-hidden`. Reutilizável (auth hero, headers, vazios).
 */
export function GoliseuMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M32 2 58 14v22c0 13-11 22-26 26C17 58 6 49 6 36V14L32 2Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        pathLength={1}
      />
      <path
        d="M40.5 22.5A12 12 0 1 0 42.6 36.6"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
        pathLength={1}
      />
      <path
        d="M42.6 36.6H33"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
        pathLength={1}
      />
    </svg>
  )
}
