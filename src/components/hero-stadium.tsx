import { cn } from "@/lib/utils"

// Cantos do campo (perspectiva): pole + bandeira que treme; topo (fundo) menor.
const CORNERS = [
  { x: 140, y: 100, h: 9, w: 11, origin: "0% 0%" }, // sup. esquerdo (fundo)
  { x: 260, y: 100, h: 9, w: -11, origin: "100% 0%" }, // sup. direito (fundo)
  { x: 65, y: 288, h: 18, w: 15, origin: "0% 0%" }, // inf. esquerdo (perto)
  { x: 335, y: 288, h: 18, w: -15, origin: "100% 0%" }, // inf. direito (perto)
] as const

// Confete da comemoração (cores da marca; --cx espalha lateral).
const CONFETTI_COLORS = ["var(--primary)", "var(--gold)", "var(--glow-accent)", "var(--chart-2)", "var(--chart-3)"]

/**
 * Ilustração SVG animada do hero da landing — a "arena Goliseu": campo em
 * perspectiva sob refletores, DOIS gols (perto e ao fundo), bola rolando em loop
 * até o gol do fundo com a rede estufando, placar que VIRA no gol (1→2),
 * torcida atrás do gol que vibra + confetes na comemoração, e bandeiras nos
 * QUATRO cantos tremulando. DECORATIVA (`aria-hidden`): o hero textual é o
 * conteúdo acessível.
 *
 * Temável sem JS (currentColor + tokens). Movimento 100% CSS (classes `hs-*`),
 * zerado sob `prefers-reduced-motion` (cena parada). Bola/confete desenhados
 * CENTRADOS na origem do próprio grupo p/ `scale`/`rotate` girarem no centro.
 */
export function HeroStadium({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-auto w-full", className)}
      style={{ color: "var(--foreground)" }}
    >
      <defs>
        <radialGradient id="hs-flood-l" cx="50%" cy="0%" r="75%">
          <stop offset="0%" style={{ stopColor: "var(--glow-accent)", stopOpacity: 0.5 }} />
          <stop offset="60%" style={{ stopColor: "var(--glow-accent)", stopOpacity: 0.08 }} />
          <stop offset="100%" style={{ stopColor: "var(--glow-accent)", stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="hs-flood-r" cx="50%" cy="0%" r="75%">
          <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.45 }} />
          <stop offset="60%" style={{ stopColor: "var(--primary)", stopOpacity: 0.08 }} />
          <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="hs-pitch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.05 }} />
          <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0.18 }} />
        </linearGradient>
        <radialGradient id="hs-goal-flash" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--gold)", stopOpacity: 0.8 }} />
          <stop offset="100%" style={{ stopColor: "var(--gold)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="hs-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--glow-accent)", stopOpacity: 0.16 }} />
          <stop offset="100%" style={{ stopColor: "var(--glow-accent)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      {/* Glows dos refletores (respiram) */}
      <ellipse className="animate-breathe" cx="78" cy="30" rx="120" ry="150" fill="url(#hs-flood-l)" />
      <ellipse className="animate-breathe" style={{ animationDelay: "2.5s" }} cx="322" cy="30" rx="120" ry="150" fill="url(#hs-flood-r)" />

      {/* Feixe do refletor esquerdo varrendo (sutil) */}
      <polygon className="hs-beam" points="78,18 40,168 116,168" fill="url(#hs-beam)" />

      {/* Arquibancada em arco (Coliseu) */}
      <g fill="none" stroke="currentColor" opacity="0.1">
        <path d="M44 104 Q200 28 356 104" strokeWidth="1.2" />
        <path d="M30 112 Q200 20 370 112" strokeWidth="1" opacity="0.7" />
        <path d="M58 98 Q200 36 342 98" strokeWidth="1" opacity="0.7" />
      </g>
      {/* Torcida geral (cintila) */}
      <g fill="currentColor">
        {Array.from({ length: 30 }).map((_, i) => {
          const t = i / 29
          const x = 46 + t * 308
          const y = 97 - Math.sin(t * Math.PI) * 62
          return <circle key={i} className="hs-twinkle" style={{ animationDelay: `${(i % 7) * 0.34}s` }} cx={x} cy={y} r="1.5" />
        })}
      </g>
      {/* Torcida ATRÁS DO GOL (vibra no gol) */}
      <g fill="currentColor">
        {Array.from({ length: 32 }).map((_, i) => {
          const col = i % 8
          const row = Math.floor(i / 8)
          const x = 168 + col * 9.2
          const y = 60 + row * 6.2
          return <circle key={i} className="hs-cheer" style={{ animationDelay: `${(i % 5) * 0.05}s` }} cx={x} cy={y} r="1.4" />
        })}
      </g>

      {/* Placar (vira no gol: 1 → 2) */}
      <g>
        <rect x="156" y="3" width="88" height="23" rx="5" fill="var(--card)" stroke="currentColor" strokeOpacity="0.22" />
        <circle className="animate-breathe" cx="166" cy="14.5" r="2.4" fill="var(--primary)" />
        <g style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 700 }} fill="currentColor">
          <text className="hs-score-a" x="184" y="19" fontSize="13" textAnchor="middle">1</text>
          <text className="hs-score-b" x="184" y="19" fontSize="13" textAnchor="middle">2</text>
          <text x="200" y="18.5" fontSize="11" textAnchor="middle" fillOpacity="0.55">×</text>
          <text x="216" y="19" fontSize="13" textAnchor="middle">1</text>
        </g>
      </g>

      {/* Campo em perspectiva */}
      <g>
        <path d="M140 100 L260 100 L335 288 L65 288 Z" fill="url(#hs-pitch)" />
        {[0, 1, 2, 3, 4].map((i) => {
          const y0 = 100 + i * 37.6
          const y1 = y0 + 37.6
          const lx = (y: number) => 140 - (y - 100) * (75 / 188)
          const rx = (y: number) => 260 + (y - 100) * (75 / 188)
          return <path key={i} d={`M${lx(y0)} ${y0} L${rx(y0)} ${y0} L${rx(y1)} ${y1} L${lx(y1)} ${y1} Z`} fill="var(--primary)" fillOpacity={i % 2 === 0 ? 0.06 : 0.12} />
        })}
        <g fill="none" stroke="currentColor" strokeOpacity="0.32" strokeWidth="1.1">
          <path d="M140 100 L260 100 L335 288 L65 288 Z" />
          <line x1="102.5" y1="194" x2="297.5" y2="194" />
          <ellipse cx="200" cy="194" rx="30" ry="11" />
          {/* grande/pequena área do gol do FUNDO */}
          <path d="M172 100 L228 100 L233 124 L167 124 Z" />
          <path d="M186 100 L214 100 L216 110 L184 110 Z" />
          {/* grande/pequena área do gol de PERTO */}
          <path d="M150 288 L250 288 L243 256 L157 256 Z" />
          <path d="M178 288 L222 288 L219 274 L181 274 Z" />
        </g>
        {/* Bandeiras nos quatro cantos (tremulam) */}
        {CORNERS.map((c) => (
          <g key={`${c.x}-${c.y}`}>
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y - c.h} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
            <polygon
              className="hs-flag"
              style={{ transformOrigin: c.origin }}
              points={`${c.x},${c.y - c.h} ${c.x + c.w},${c.y - c.h + 3.2} ${c.x},${c.y - c.h + 6.4}`}
              fill="var(--primary)"
              fillOpacity="0.8"
            />
          </g>
        ))}
      </g>

      {/* Gol de PERTO (não marca — só geometria) */}
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <g strokeOpacity="0.2" strokeWidth="0.9">
          <line x1="170" y1="262" x2="170" y2="288" />
          <line x1="185" y1="262" x2="185" y2="288" />
          <line x1="200" y1="262" x2="200" y2="288" />
          <line x1="215" y1="262" x2="215" y2="288" />
          <line x1="230" y1="262" x2="230" y2="288" />
          <line x1="166" y1="270" x2="234" y2="270" />
          <line x1="164" y1="280" x2="236" y2="280" />
        </g>
        <g strokeOpacity="0.85" strokeWidth="2.2">
          <line x1="164" y1="288" x2="164" y2="261" />
          <line x1="236" y1="288" x2="236" y2="261" />
          <line x1="164" y1="261" x2="236" y2="261" />
        </g>
      </g>

      {/* Flash dourado da comemoração */}
      <ellipse className="hs-flash" cx="200" cy="92" rx="46" ry="26" fill="url(#hs-goal-flash)" />

      {/* Gol do FUNDO: trave + rede (estufa) */}
      <g>
        <g className="hs-net" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.8">
          {/* rect transparente dá área de FILL ao grupo (só-stroke): torna o
              transform-box:fill-box do ripple robusto em WebKit/iOS. */}
          <rect x="184" y="82" width="32" height="18" fill="transparent" stroke="none" />
          <line x1="186" y1="84" x2="186" y2="100" />
          <line x1="192" y1="83" x2="192" y2="100" />
          <line x1="200" y1="82.5" x2="200" y2="100" />
          <line x1="208" y1="83" x2="208" y2="100" />
          <line x1="214" y1="84" x2="214" y2="100" />
          <line x1="186" y1="89" x2="214" y2="89" />
          <line x1="185" y1="94" x2="215" y2="94" />
        </g>
        <g fill="none" stroke="currentColor" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round">
          <line x1="184" y1="100" x2="184" y2="82" />
          <line x1="216" y1="100" x2="216" y2="82" />
          <line x1="184" y1="82" x2="216" y2="82" />
        </g>
      </g>

      {/* Confetes — burst da comemoração (cada um centrado na origem do seu <g>) */}
      <g>
        {Array.from({ length: 22 }).map((_, i) => {
          const x = 165 + (i % 11) * 7
          const y = 73 + (i % 3) * 5
          const cx = ((i % 7) - 3) * 9
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect className="hs-confetti" style={{ ["--cx" as string]: `${cx}px`, animationDelay: `${(i % 5) * 0.04}s` }} x="-3" y="-1.8" width="6" height="3.6" rx="0.6" fill={color} />
            </g>
          )
        })}
      </g>

      {/* Bola — centrada na origem (0,0), posicionada/animada por translate */}
      <g className="hs-ball">
        <ellipse cx="0" cy="11" rx="7" ry="2.2" fill="currentColor" fillOpacity="0.16" />
        <g className="hs-ball-spin">
          <circle r="8" fill="#fbfbf7" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
          <polygon points="0,-3.6 3.42,-1.11 2.12,2.91 -2.12,2.91 -3.42,-1.11" fill="var(--primary)" fillOpacity="0.85" />
          <g stroke="var(--primary)" strokeOpacity="0.5" strokeWidth="0.8">
            <line x1="0" y1="-3.6" x2="0" y2="-7.5" />
            <line x1="3.42" y1="-1.11" x2="7" y2="-2.6" />
            <line x1="2.12" y1="2.91" x2="4.6" y2="6" />
            <line x1="-2.12" y1="2.91" x2="-4.6" y2="6" />
            <line x1="-3.42" y1="-1.11" x2="-7" y2="-2.6" />
          </g>
        </g>
      </g>
    </svg>
  )
}
