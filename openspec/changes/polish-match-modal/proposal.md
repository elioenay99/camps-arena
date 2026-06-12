# Proposal — polish-match-modal

## Why

O `MatchScoreModal` ("Menu da Partida") é usado o tempo todo — é o gesto central do
produto (lançar placar). Ele ficou visualmente antes do overhaul: título em
`text-lg font-semibold` (sem `font-display`), caixa do placar `bg-muted/40` sem
profundidade, e — pior — o botão **SALVAR PLACAR usa `bg-green-700`**, que pela
paleta ([[arena-paleta-visual]]) é a afordância EXCLUSIVA do WhatsApp. No tema
dark (primary roxo) o "salvar" verde se confunde com uma ação de WhatsApp. Item #4
do backlog de UI ([[arena-ui-backlog]]); uso majoritário em celular
([[feedback-mobile-pwa]]).

## What Changes

Apresentação apenas — toda a lógica (atualização otimista do placar, persistência
via `onSave`, atalho `wa.me` POR COLUNA sem auto-chamada, seleção de clube, papéis
acessíveis e regiões live) permanece byte-idêntica e coberta por
`MatchScoreModal.test.tsx`.

- **Tipografia da marca**: título em `font-display font-bold`; rótulos e o número
  grande do placar com o idioma já estabelecido (Space Grotesk no placar).
- **SALVAR PLACAR vira botão PRIMARY** (default), liberando o `bg-green-700`
  apenas para o atalho WhatsApp (a afordância da marca). Sentence-case nos botões
  ("Salvar placar" / "Fechar").
- **Caixa do placar com `.elevate`** (mesma profundidade dos cards já polidos) e
  rótulo "Lançar placar" no estilo eyebrow/seção.
- **Mobile-first 390px**: mantém as 2 colunas (decisão do usuário) com respiro
  melhor (gaps, truncamento, alvos de toque), validado no viewport 390px.

## Capabilities

Nenhuma capability nova. Adiciona um requisito de APRESENTAÇÃO do modal em
`match-score-modal` (comportamento/dados/contrato inalterados).

## Impact

- **Editado**: `src/features/match/components/MatchScoreModal.tsx` (só o JSX/
  classes de apresentação).
- **Sem mudança**: `MatchScoreModalConnected.tsx`, actions (`updateMatchScore`/
  `updateMatchTeams`/`selectTeam`), helper `whatsapp.ts`, e `MatchScoreModal.test.tsx`
  (atalho wa.me por coluna, sem auto-chamada — deve passar inalterado).
- **Risco**: baixo (presentational, client). Validar contraste AA nos 2 temas, o
  placar central no 390px (2 colunas com busca de clube + WhatsApp), e que o botão
  primário não colida com o verde do WhatsApp.
