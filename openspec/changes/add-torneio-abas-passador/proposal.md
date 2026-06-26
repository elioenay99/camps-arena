# Proposal — add-torneio-abas-passador

## Why

A página de detalhe do torneio (`/dashboard/torneios/[id]`) empilha ~15 seções num scroll
único: cabeçalho, classificação/chave/grupos, liberação de rodadas (até 38 chips), partidas em
aberto (até 380 jogos num Brasileirão), resultados/W.O. pendentes, partidas encerradas, clubes,
vagas/participantes, convite e administração. Num campeonato grande — e no celular (uso
majoritário) — vira uma lista interminável e difícil de navegar (feedback do dono, chat
2026-06-25, com prints).

Pedido do dono (confirmado via AskUserQuestion):
1. **Separar em abas** — agrupamento "por assunto": **Classificação · Partidas · Rodadas · Vagas**.
2. **Passador por rodada nas partidas** — em vez de despejar todas as partidas de todas as
   rodadas, mostrar **uma rodada por vez** com um navegador (‹ anterior · Rodada N · próxima ›)
   pra transitar entre elas.

## What Changes

- **Abas (layout da página)** — novo wrapper client `TournamentTabs` + componente base
  `src/components/ui/tabs.tsx` (sobre `@radix-ui/react-tabs`, já nas deps). A RSC `page.tsx`
  segue carregando TODOS os dados e aplicando TODOS os gates (papel/formato); ela monta o
  conteúdo de cada aba como `ReactNode` e passa ao wrapper (padrão "children as props"). As abas
  são **dinâmicas**: só aparece a que tem conteúdo (ex.: "Rodadas" só p/ quem arbitra um formato
  gerado com cadência; "Partidas" some sem jogos). Padrão = **Classificação**. O **cabeçalho**
  (nome/status/Cores/Nova partida) e a **Administração** (Equipe/Encerrar/Reabrir) ficam FORA das
  abas (topo). Troca de aba é client-side (sem recarregar a página / sem refazer as queries).

- **Passador por rodada (`RoundPager`)** — novo componente client em
  `src/features/match/components/RoundPager.tsx`. Nas listas competitivas (partidas com `rodada`),
  mostra **uma rodada por vez** com ‹ anterior · "Rodada N de M" · próxima › e um seletor pra
  pular direto (38 rodadas). Abre na **rodada ativa** (abertas) / **última rodada** (encerradas).
  O "Fechar rodada" (dono, rodada ativa) migra do cabeçalho da rodada para o cabeçalho do
  passador. O **avulso** (sem `rodada`) mantém a **lista plana** atual. Aplicado a
  `OpenMatchesList` (abertas) e `MatchHistoryList` (encerradas).

- **PII intacta** — `OpenMatchesList` monta o link `wa.me` com o celular do adversário NO
  SERVIDOR (PII embutida no link, nunca crua). Continua RSC: ele renderiza cada rodada como um
  nó e passa os nós prontos ao `RoundPager` (client), que só alterna qual aparece. Nenhum celular
  cru cruza a fronteira RSC→client.

## Impact

- **Specs**: `tournament-management` (a página de detalhe organiza as seções em abas dinâmicas) e
  `match-engagement` (as listas de partidas paginam por rodada com um passador; avulso plano).
- **Componentes novos**: `src/components/ui/tabs.tsx`,
  `src/features/tournament/components/TournamentTabs.tsx`,
  `src/features/match/components/RoundPager.tsx`. **Refactor**:
  `src/app/dashboard/torneios/[id]/page.tsx` (compõe as abas),
  `src/features/match/components/OpenMatchesList.tsx` (passador no ramo competitivo),
  `src/features/match/components/MatchHistoryList.tsx` (agrupa por rodada + passador).
- **Dependência**: nenhuma nova — `@radix-ui/react-tabs` já vem no umbrella `radix-ui`.
- **Banco**: nenhum. **PII**: inalterada (nós renderizados no servidor; gates na RSC).
- **Testes**: `TournamentTabs` (abas dinâmicas, troca, padrão), `RoundPager` (rodada inicial,
  anterior/próxima, pular, rodada única), `OpenMatchesList` (competitivo paginado; avulso plano
  preservado), `MatchHistoryList` (paginado por rodada; avulso/encerradas sem rodada plano).
- **Compatibilidade**: o conteúdo das seções e suas ações não mudam — só a apresentação
  (abas + paginação). Avulso intocado (lista plana).
- **Fora de escopo**: abas por URL (`?aba=`) — usamos estado client; paginar os chips da
  "Liberação de rodadas" (a aba Rodadas mantém os chips, é outra interação); qualquer mudança de
  regra/gating/RLS.
