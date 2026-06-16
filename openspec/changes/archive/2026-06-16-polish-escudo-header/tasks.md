# Tasks — polish-escudo-header

Gate: apresentação RSC (sem `"use client"`); movimento 100% CSS na identidade;
zerado sob `prefers-reduced-motion`; validação visual ao vivo (390px + desktop,
2 temas, reduced-motion); gates typecheck/lint/test/build.

## 1. Componente da marca
- [x] 1.1 `goliseu-mark.tsx`: `pathLength={1}` nos 3 paths (inócuo nos usos estáticos).

## 2. CSS (globals.css)
- [x] 2.1 `.goliseu-mark-draw path` — dasharray/dashoffset 1 + animação `goliseu-mark-draw`
  forwards; stagger por `:nth-child` (escudo 0.15s → arco 0.5s → base 0.78s).
- [x] 2.2 `.goliseu-mark-glow` — drop-shadow idle do `--primary` + transição; `.group:hover`
  intensifica o glow e aplica `scale(1.08) rotate(-3deg)`.
- [x] 2.3 `@keyframes goliseu-mark-draw` (dashoffset 1→0).
- [x] 2.4 Bloco `prefers-reduced-motion`: `.goliseu-mark-draw path` sem animação +
  `stroke-dashoffset:0`; `.goliseu-mark-glow` sem transição; hover sem transform.

## 3. Header da landing (page.tsx)
- [x] 3.1 Wrapper `span.group` (escudo + wordmark, flex/itens centrados) + `<GoliseuMark>`
  (`goliseu-mark-draw goliseu-mark-glow size-7 text-primary`) antes do wordmark + import.

## 4. Gates de qualidade
- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — VERDE (1085 testes).

## 5. Validação ao vivo
- [x] 5.1 Chrome-devtools em `/` (contexto anônimo isolado): escudo aparece antes do wordmark,
  alinhado, nos 2 temas (dark=roxo, light=verde) e em 390px + desktop. `getComputedStyle`:
  3 paths `strokeDashoffset:0px` (desenho completo), visível 28px, glow class presente.
- [x] 5.2 `prefers-reduced-motion`: garantido por CSS (`stroke-dashoffset:0` explícito no bloco
  reduzido) — estado final idêntico ao já renderizado; sem risco de escudo invisível. (A media
  não foi emulada no browser — o MCP não expõe; verificado por código + equivalência de estado.)

## 6. Encerramento
- [x] 6.1 Commit (pt-BR, Conventional Commits, sem coautoria) + push.
- [x] 6.2 `openspec archive polish-escudo-header`.
- [x] 6.3 Atualizar [[arena-ui-backlog]].
