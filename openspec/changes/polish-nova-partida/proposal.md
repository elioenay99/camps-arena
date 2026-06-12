# Proposal — polish-nova-partida

## Why

A criação de partida avulsa são duas telas simples que ficaram antes do overhaul:
o **seletor** `/dashboard/partidas/nova` (já com `font-display`) e o **form**
`/dashboard/torneios/[id]/partidas/nova`, cujo título usa `text-2xl` SEM
`font-display` (inconsistente com o seletor) e cujo `MatchCreateForm` é apenas
dois selects empilhados ("Participante 1/2") sem nenhuma identidade — sendo que é
um CONFRONTO (P1 × P2). Item #5 do backlog de UI ([[arena-ui-backlog]]);
mobile-first ([[feedback-mobile-pwa]]).

## What Changes

Apresentação apenas — a lógica (action `createMatch`, names `participante1`/
`participante2`, opção "Definir depois", gate de dono/avulso na página) permanece
inalterada.

- **Cabeçalho consistente** nas duas telas: ícone do confronto (`Swords`) em chip
  + título em `font-display`, centralizado (idioma das telas de card pequenas).
- **`MatchCreateForm` com cara de confronto**: um conector `×` (divisor com badge
  central) entre os dois selects de participante, empilhados (mobile-first).
- Alinhamento de tokens (selects já usam os tokens do design system; mantidos).

## Capabilities

Nenhuma capability nova. Adiciona um requisito de APRESENTAÇÃO da criação de
partida em `match-creation` (comportamento/dados/contrato inalterados).

## Impact

- **Editados**: `src/features/match/components/MatchCreateForm.tsx` (conector ×),
  `src/app/dashboard/partidas/nova/page.tsx` e
  `src/app/dashboard/torneios/[id]/partidas/nova/page.tsx` (cabeçalho com ícone +
  font-display).
- **Sem mudança**: action `createMatch`, fetchers, RLS, gates, e os names/opção
  dos selects.
- **Risco**: baixo (presentational). Validar nos 2 temas + 390px (o divisor × e o
  cabeçalho centralizado).
