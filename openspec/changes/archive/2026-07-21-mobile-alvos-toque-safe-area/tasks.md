## 1. Alvos de toque no primitivo `Button`

- [x] 1.1 `src/components/ui/button.tsx` — `sm: h-11 md:h-7`, `lg: h-12 md:h-9`,
      `icon: size-11 md:size-8`, `icon-sm: size-11 md:size-7`, `icon-lg: size-12 md:size-9`.
      `default`, `xs` e `icon-xs` inalterados.
- [x] 1.2 `src/features/league/components/FluxoTemporadaPanel.tsx` — o par de chevrons de
      reordenação de empate sobe de `size-7` para `size-9 md:size-7` (36px no mobile;
      decisão registrada em `design.md`, NÃO atinge 44px).
- [x] 1.3 Novo `src/components/ui/button.test.tsx` — alvo mobile ≥44px por variante
      (`default`/`sm`/`lg`/`icon`/`icon-sm`/`icon-lg`), monotonicidade `lg ≥ default` nos
      dois breakpoints, densidade `md:` preservada, e `xs`/`icon-xs` como exceção explícita.

## 2. Área segura e comportamento da PWA

- [x] 2.1 `src/app/layout.tsx` — `viewportFit: "cover"` no `export const viewport`.
- [x] 2.2 `src/app/globals.css` — `overscroll-behavior-y: contain` e
      `padding-bottom: env(safe-area-inset-bottom)` no `body`; `overflow-x: clip` intocado.
- [x] 2.3 `src/app/dashboard/layout.tsx` e `src/features/demo/components/DemoNav.tsx` —
      `pt-[env(safe-area-inset-top)]` nos headers `sticky top-0`.
- [x] 2.4 `src/app/layout.tsx` — `<Toaster>` de `top-center` para `bottom-center`.
- [x] 2.5 Novo `src/app/viewport.test.ts` — `viewportFit: "cover"` presente e coerente com
      `statusBarStyle: "black-translucent"`.

## 3. Gate

- [x] 3.1 `openspec validate mobile-alvos-toque-safe-area --strict` = valid.
- [x] 3.2 `pnpm typecheck` verde.
- [x] 3.3 `pnpm lint` verde.
- [x] 3.4 Subset de testes verde (`--maxWorkers=2`): `src/components`, `src/app`,
      `src/features/nav`, `src/features/match`, `src/features/demo`, `src/features/league`.
- [ ] 3.5 Commit em pt-BR (Conventional Commits, sem coautoria de IA). **Sem push.**

## 4. Fora deste lote (registrado)

- [ ] 4.1 Remover os ~12 remendos `min-h-11`/`size-11` por chamada, agora redundantes —
      refactor cosmético, sem ganho funcional (`design.md`, Decisão 1).
- [ ] 4.2 Validação visual a 390px (dashboard, landing, demo, modal de placar, toast) —
      **é do orquestrador**, não deste specialist.
