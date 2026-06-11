# Tasks — rebrand-goliseu

## 1. Símbolo da marca

- [x] 1.1 Redesenhar o glifo do escudo A→G em `app/icon.svg` (favicon) mantendo o
      hexágono Dracula e o roxo `#bd93f9`; legível em 16px. (Validado por render
      em 48px/16px.)
- [x] 1.2 Renomear `components/arena-mark.tsx` → `goliseu-mark.tsx`, `ArenaMark` →
      `GoliseuMark`, redesenhar o glifo A→G (currentColor); atualizar imports.

## 2. Wordmark + cópia

- [x] 2.1 Wordmark `ARENA·` → `GOLISEU·` em `AuthShell`, landing e dashboard header.
- [x] 2.2 Frases visíveis "Arena" → "Goliseu" (login, cadastro, dashboard, novo
      torneio, convite, WhatsApp); concordância "o Goliseu cuida".

## 3. Metadata/SEO + OG

- [x] 3.1 `layout.tsx`: title/siteName/OG → Goliseu. Todos os títulos de página
      `· Arena` → `· Goliseu`.
- [x] 3.2 OG estático `og/brand.tsx`: texto renderizado + `OG_ALT` → Goliseu.

## 4. Internos

- [x] 4.1 Keyframes/classes CSS `arena-*` → `goliseu-*` em `globals.css`.
- [x] 4.2 `package.json` name → `goliseu`; heading do `CLAUDE.md`.

## 5. Validação

- [x] 5.1 Grep de regressão: zero "Arena"/"arena-mark"/"ArenaMark" remanescente
      (exceto valores de teste e ID histórico fora de escopo).
- [x] 5.2 Gates: typecheck ✅ / lint ✅ / test (848 ✅) / build ✅.
- [x] 5.3 Ao vivo (next start + Playwright, 2 temas): landing (GOLISEU· dark/light),
      auth (escudo G + cópias do/no Goliseu dark/light), favicon G (16/48px), card
      OG (1200×630, wordmark "Goliseu" + escudo G) — todos conferidos por render.
- [x] 5.4 Self-review do diff completo (mecânico, sem lógica) + gates; commit +
      push + CI + archive.
