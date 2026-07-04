## Why

No celular, como ORGANIZADOR (capacidade ARBITRAR), o dono abriu "Editar placar" (modo
direto → `updateMatchScore`) numa partida competitiva que JÁ TINHA uma **proposta de placar
PENDENTE** (um técnico de vaga submeteu placar + foto para aprovação). Gravar o placar direto
por cima de uma proposta pendente é inconsistente: o organizador tem DUAS superfícies para o
mesmo resultado (o editor direto e a seção "Resultados pendentes" de aprovar/rejeitar), e usar
a errada deixa a proposta órfã (o técnico continua vendo "aguardando aprovação" enquanto o
placar já foi gravado por outro caminho).

O erro genérico em inglês relatado no repro do dono ("An unexpected response was received from
the server") é quase certamente **skew de Server Action** (deploys múltiplos com o app aberto;
um refresh resolve) — NÃO é o alvo desta change. `updateMatchScore` (`src/actions/match.ts:73`)
NÃO tem caminho que estoure por proposta pendente: todos os erros reais viram
`{ok:false, error:"...pt-BR..."}`, o modal (`MatchScoreModal.tsx`) mostra fielmente
`erro.message`, e `enviarNotificacoes` (`src/features/notifications/enviar.ts`) é best-effort e
NUNCA lança (todo o corpo sob try/catch). Confirmado: não há throw genuíno não-tratado no
caminho feliz de `updateMatchScore`.

O ALVO REAL (o que o dono pediu): a UI do organizador NÃO deve OFERECER a edição direta de
placar quando há proposta pendente para aquela partida — o caminho correto passa a ser
aprovar/rejeitar na seção `PropostasPendentes`, que já existe.

## What Changes

Um gate de UX na lista + uma guarda de defesa em profundidade no servidor. Quatro camadas
ADITIVAS:

- **Plumbing do `matchId`** — `getPropostasPendentes` (`src/features/match/data/`) passa a
  expor `matchId: string` em cada `PropostaPendente` (a coluna FK `match_id` já embutida no
  select via `matches!...!inner`). Aditivo: nenhum consumidor atual quebra.
- **Conjunto de partidas com pendência** — a page do torneio
  (`src/app/dashboard/torneios/[id]/page.tsx`) monta
  `matchesComPropostaPendente = new Set(propostasPendentes.map((p) => p.matchId))` e o passa ao
  `OpenMatchesList`. (`propostasPendentes` só é buscado quando `ehGerado` E quem arbitra — fora
  disso é `[]`, o Set fica vazio e NADA muda.)
- **Gate + indicador no `OpenMatchesList`** — quando `matchesComPropostaPendente.has(p.id)`, o
  botão "Editar placar" (e o "Encerrar" e o "W.O.") NÃO aparece; no lugar, um chip discreto
  "Aguardando aprovação — veja Resultados pendentes" comunica que o caminho é a seção de
  aprovação. Sem pendência, tudo renderiza como hoje.
- **Guarda no servidor (defesa em profundidade)** — `updateMatchScore` (`src/actions/match.ts`),
  ANTES do UPDATE e só no caminho NÃO-avulso, consulta se há proposta pendente para a partida
  (`match_score_proposals` where `match_id` = matchId and `status` = `pendente`, limit 1) e, se
  houver, recusa limpo: `{ok:false, error:"Há uma proposta de placar aguardando aprovação.
  Aprove ou rejeite antes de editar o placar direto."}`. Fecha a corrida de aba-velha / POST
  direto (a UI é alcançável fora do gate) e dá mensagem clara em vez do "unexpected response".

Decisão sobre "Encerrar"/"W.O.": gateados JUNTO do "Editar placar". Encerrar a partida ou marcar
W.O. com uma proposta de placar pendente é igualmente inconsistente (encerraria com 0×0 ou por
ausência, ignorando o placar proposto). Aprovar a proposta JÁ encerra a partida (spec
`match-result-approval`), então o organizador não perde nenhum caminho legítimo — só é
redirecionado à superfície correta. O atalho "Chamar" (WhatsApp) e o "Solicitar W.O." de quem
joga permanecem (não são console de organizador).

## Impact

- **SEM DDL, SEM mudança de dados, SEM migration.** Um campo aditivo no fetcher + um Set na page
  + um gate de UI + uma consulta de leitura na action.
- Arquivos: `src/features/match/data/getPropostasPendentes.ts` (campo `matchId`),
  `src/app/dashboard/torneios/[id]/page.tsx` (Set + prop nova),
  `src/features/match/components/OpenMatchesList.tsx` (prop + gate + indicador),
  `src/actions/match.ts` (guarda de proposta pendente antes do UPDATE),
  `src/features/match/components/MatchListsRodada.test.tsx`,
  `src/features/match/data/getPropostasPendentes.test.ts`,
  `src/actions/match.test.ts`,
  `src/features/match/components/PropostasPendentes.test.tsx` (testes discriminantes).
- Partidas SEM proposta pendente renderizam exatamente como hoje (o gate só intercepta as
  partidas cujo id está no Set — vazio quando não há pendência ou quem vê não arbitra).
