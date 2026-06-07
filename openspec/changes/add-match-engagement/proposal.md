# Proposal — add-match-engagement

## Why

O loop de re-engajamento do roadmap ("sua vez de jogar") hoje se resume a um
botão escondido DENTRO do modal de placar do dashboard, que abre um chat
vazio no WhatsApp. Cobrar o adversário — o gesto que mantém o torneio vivo —
exige abrir o modal, e na página do torneio (onde as partidas em aberto de
liga/grupos/chave moram) não existe atalho nenhum. Decisões de produto via
AskUserQuestion (2026-06-07): atalho visível no card do dashboard E nas
partidas em aberto da página do torneio; SÓ o adversário da própria partida
vê o atalho (exposição mínima de celular); mensagem pré-preenchida com
contexto e link do torneio.

## What Changes

- Novo helper PURO `src/lib/whatsapp.ts`: normalização do celular (extraída
  do MatchScoreModal — 11 dígitos → `55`+dígitos; 13 começando com 55 →
  direto; senão null) + builder da mensagem de convocação ("Fala, {nome}!
  Bora jogar nossa partida do {torneio} no Arena? {url}") com `?text=`
  URL-encoded; URL absoluta via `NEXT_PUBLIC_SITE_URL` (env.ts, sempre
  presente — default localhost).
- `MatchScoreModal` passa a usar o helper — o atalho existente ganha a MESMA
  mensagem pré-preenchida (fonte única).
- Dashboard: o `MatchCard` ganha o botão "Chamar {adversário}" direto no card
  (sem abrir o modal), renderizado SÓ quando o usuário logado é participante
  da partida e o adversário tem celular (`getActiveMatches` já traz celular).
- Página do torneio: `getTournamentClassificacao` passa a selecionar
  `celular` nos embeds p1/p2; `PartidaAberta` ganha ids e celulares dos
  lados; `OpenMatchesList` ganha o mesmo botão, com o MESMO gate.
- **Privacidade contida por RSC**: `MatchCard` e `OpenMatchesList` são Server
  Components — o celular do adversário só aparece no HTML de quem é
  participante da partida, dentro do `href` do botão. Visitantes e demais
  participantes não recebem o dado. (O modal do dashboard, client, mantém o
  tráfego de celular já registrado como risco aceito — nada piora.)
- Zero DDL (coluna e RLS existentes).

## Capabilities

### New Capabilities

- `match-engagement`: atalho "chamar para jogar" via WhatsApp — helper de
  link/mensagem, botão no card do dashboard e nas partidas em aberto da
  página do torneio, gate de participante.

### Modified Capabilities

- `standings-page`: o fetcher inclui `celular` nos embeds de participantes e
  `partidasAbertas` carrega ids/celulares dos lados (insumo do atalho).
- `match-score-modal`: o atalho de contato passa a abrir o chat com a
  mensagem de convocação pré-preenchida (antes: chat vazio).

## Impact

- **Lib**: novo `src/lib/whatsapp.ts` (+ testes).
- **Componentes**: `MatchCard`, `OpenMatchesList`, `MatchScoreModal` (usa o
  helper), página do torneio e dashboard (props novas: userId/título).
- **Data**: `getTournamentClassificacao` (embeds com celular).
- **Banco**: nada.
- **Não muda**: RLS, convites, formatos, lifecycle.
