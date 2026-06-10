/**
 * Escudo da marca Arena (o "A" no hexágono do `icon.svg`), como SVG inline que
 * herda `currentColor` — assim ganha cor e glow pelo contexto (text-primary,
 * etc.). Decorativo: `aria-hidden`. Reutilizável (auth hero, headers, vazios).
 */
export function ArenaMark({ className }: { className?: string }) {
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
      />
      <path
        d="M32 16 44 46h-7l-2.4-6.4H29.4L27 46h-7L32 16Zm0 13-2.4 6.2h4.8L32 29Z"
        fill="currentColor"
      />
    </svg>
  )
}
