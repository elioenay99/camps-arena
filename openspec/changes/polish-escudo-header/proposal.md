# Proposal — polish-escudo-header

## Why

O header da landing (`/`) hoje mostra só o wordmark textual `GOLISEU.` — o escudo
"G" da marca (`GoliseuMark`, já usado em auth/vazios) **não aparece** ali, apesar
de ser o ativo de identidade mais forte. A landing já é animada (`HeroStadium`),
mas a marca no topo entra estática. Dar ao escudo uma micro-animação de entrada
(stroke-draw) + um realce no hover reforça a identidade logo no primeiro olhar,
sem competir com o loop do estádio logo abaixo.

## What Changes

Apresentação apenas (rota pública, sem dados/auth novos). A landing segue **RSC**
— todo o movimento é **CSS** (sem `"use client"`), na identidade existente (marca
fixa roxa `--primary`, sem fonte/cor nova). **Zerado sob `prefers-reduced-motion`**
e validado mobile-first (390px) nos 2 temas.

- **Escudo "G" no header**: o `GoliseuMark` passa a anteceder o wordmark no header
  da landing, em `text-primary`, alinhado ao texto.
- **Entrada stroke-draw (CSS-only)**: ao carregar, os traços do escudo se
  "desenham" (contorno do hexágono → arco do G → base), via `pathLength`
  normalizado + `stroke-dashoffset`. Uma vez só (sem loop), encadeado com o
  `animate-rise` do header.
- **Realce no hover**: o conjunto marca (escudo + wordmark) ganha leve `scale` +
  glow roxo mais forte no escudo ao passar o cursor; idle tem um glow sutil.
- **`pathLength={1}`** nos paths do `GoliseuMark` (inócuo nos usos estáticos
  atuais — sem `stroke-dasharray`, não altera o render) + novos keyframes/classes
  em `globals.css` (`goliseu-mark-draw`, `goliseu-mark-glow`), incluídos no bloco
  `prefers-reduced-motion: reduce` (estado: escudo desenhado e parado).

## Capabilities

Nenhuma nova. Estende o requisito de APRESENTAÇÃO "Landing animada na identidade"
(`app-shell`) com o escudo da marca animado no header, sem mudar o comportamento
da landing (redireciona logado, falha-segura para visitante, CTAs).
