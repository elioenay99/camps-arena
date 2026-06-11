# Proposal — rebrand-goliseu

## Why

O nome "Arena" colide com um produto existente do mesmo nicho. O usuário decidiu
rebatizar o app. Direção escolhida (épica/competição) e nome final: **Goliseu**
(cunhado de *gol* + *Coliseu*) — palco épico + futebol numa palavra, único, com
`goliseu.com`, `goliseu.com.br` e `goliseu.gg` livres (whois confirmado).

## What Changes

- **Wordmark** `ARENA·` → `GOLISEU·` no hero de auth (`AuthShell`), na landing
  (`page.tsx`) e no header do dashboard (`dashboard/layout.tsx`).
- **Símbolo da marca**: o glifo dentro do escudo hexagonal muda de "A" para "G"
  (decisão do usuário) — em `icon.svg` (favicon) e `arena-mark.tsx`. O componente
  e o arquivo são renomeados `ArenaMark`→`GoliseuMark` / `arena-mark.tsx`→
  `goliseu-mark.tsx` para coerência.
- **Metadata/SEO**: `title`/`siteName`/OG em `layout.tsx` e todos os títulos de
  página `... · Arena` → `... · Goliseu`. OG estático (`brand.tsx`): texto e
  `OG_ALT`.
- **Cópia visível**: frases que citam "Arena" (login, cadastro, dashboard, novo
  torneio, convite, WhatsApp) → "Goliseu".
- **Internos**: keyframes CSS `arena-*` → `goliseu-*`; `package.json` name →
  `goliseu`; heading do `CLAUDE.md`.
- **Testes**: assertion do `whatsapp.test.ts` acompanha a nova cópia.

Fora de escopo (não tocar): valores de teste arbitrários que por acaso contêm
"arena" (`env.test.ts`, `scrub.test.ts` — URLs de exemplo, não a marca); o ID
histórico de change arquivada `add-arena-app`; a paleta/tokens de cor (a marca
fixa segue roxo Dracula — só o nome e o glifo mudam).

## Capabilities

Nenhuma capability nova. Atualiza o requisito de IDENTIDADE DE MARCA do
`design-system` (nome/wordmark/símbolo). Comportamento, dados e fluxos inalterados.

## Impact

- **Editados (cópia/metadata)**: `layout.tsx`, `page.tsx`, `dashboard/layout.tsx`,
  `login/`, `cadastro/`, `recuperar-senha/`, `atualizar-senha/`, `dashboard/page`,
  `dashboard/conta/`, `dashboard/torneios/`, `dashboard/torneios/novo/`,
  `dashboard/torneios/[id]/`, `dashboard/torneios/[id]/partidas/nova/`,
  `dashboard/partidas/nova/`, `convite/[codigo]/`, `AuthShell.tsx`, `og/brand.tsx`,
  `whatsapp.ts`, `globals.css`, `CLAUDE.md`, `package.json`.
- **Renomeados**: `components/arena-mark.tsx` → `goliseu-mark.tsx` (+ `ArenaMark`
  → `GoliseuMark`); `icon.svg` redesenha o glifo A→G.
- **Testes**: `whatsapp.test.ts`.
- **Sem mudança**: queries, RLS, actions, motores, paleta, tokens, dados.
- **Risco**: baixo (string/asset; sem lógica). Verificar que nenhuma referência a
  `ArenaMark`/`arena-mark` ou cópia "Arena" sobra; favicon "G" legível em 16px.
