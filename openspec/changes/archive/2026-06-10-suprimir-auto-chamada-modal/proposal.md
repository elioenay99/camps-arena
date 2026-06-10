# Proposal — suprimir-auto-chamada-modal

## Why

Wart conhecido (herdado de `add-match-engagement`): o `MatchScoreModal` mostra o
botão "Chamar …" (WhatsApp) em **ambas** as colunas — inclusive a do PRÓPRIO
usuário logado, gerando uma **auto-chamada** (botão para chamar a si mesmo, com a
mensagem saudando o próprio nome). O `MatchCard` já calcula corretamente quem é o
adversário e só mostra o atalho direto no card para o lado oposto; mas o modal,
sendo apresentacional, decidia o botão só por "tem celular?", sem saber qual lado
é o usuário.

## What Changes

- **`MatchScoreModal` (`ParticipantePartida`)**: novo campo `convocavel?: boolean`.
  O botão "Chamar …" de uma coluna só aparece quando `convocavel` é `true` (além
  de haver celular válido). Lado do usuário (`convocavel` ausente/`false`) → sem
  botão. À prova de regressão: qualquer uso futuro precisa declarar quem é
  convocável, então a auto-chamada não volta por descuido.
- **`MatchCard`**: marca `p1.convocavel`/`p2.convocavel` a partir do `adversario`
  já computado — só o lado adversário é convocável; quando o usuário não joga
  (`adversario` null), nenhum lado é.
- Sem mudança no atalho direto do card, no helper `linkWhatsApp`, nas Server
  Actions, no banco ou na privacidade por RSC. Puramente UI client.

## Capabilities

Nenhuma capability nova. Modifica o requisito de contato do `match-score-modal`.

## Impact

- **`src/features/match/components/MatchScoreModal.tsx`**: campo `convocavel` +
  gate do link (`convocavel ? linkWhatsApp(...) : null`).
- **`src/features/match/components/MatchCard.tsx`**: seta `convocavel` por lado.
- **Testes**: `MatchScoreModal.test.tsx` ganha o caso "sem auto-chamada" e
  marca `convocavel` nos lados; `MatchCard.test.tsx` ganha guard que captura as
  props do modal e checa que o próprio usuário não é convocável (e que espectador
  não torna ninguém convocável). +3 testes.
- **Comportamento**: o usuário deixa de ver o botão de chamar a si mesmo; o botão
  do adversário permanece idêntico. Nada mais muda.
- **Risco**: mínimo (UI client, coberto por testes). Sem DDL, sem credencial.
