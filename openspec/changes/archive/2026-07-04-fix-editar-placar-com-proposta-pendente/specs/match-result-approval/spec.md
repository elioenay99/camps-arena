## ADDED Requirements

### Requirement: Organizador não edita placar direto com proposta pendente

A UI do organizador (quem tem capacidade de **arbitrar**) NÃO SHALL oferecer a edição direta de
placar de uma partida quando existe uma **proposta de placar PENDENTE** para ela — o caminho
SHALL ser aprovar ou rejeitar a proposta na seção de resultados pendentes. O componente
`OpenMatchesList` (`src/features/match/components/OpenMatchesList.tsx`) SHALL receber o conjunto
das partidas com proposta pendente (`matchesComPropostaPendente: Set<string>`, derivado na page
do torneio a partir de `getPropostasPendentes`, cujo `PropostaPendente` SHALL expor `matchId`) e,
para toda partida cujo id pertença ao conjunto, SHALL ESCONDER os controles de console do
organizador daquela partida — "Editar placar", "Encerrar" e "W.O." — exibindo no lugar um
indicador discreto ("Aguardando aprovação de placar").

Esta é uma proteção de UX: a autorização real permanece na Server Action `updateMatchScore` + na
RLS. O conjunto SHALL ser vazio (gate no-op) fora da visão de quem arbitra um campeonato gerado
(a RLS de `match_score_proposals` só entrega as linhas ao aprovador, e a page só busca as
propostas quando `ehGerado` e a capacidade de arbitrar está presente). Partidas SEM proposta
pendente SHALL renderizar exatamente como antes (botões preservados). Os controles que NÃO são
console de organizador — o atalho "Chamar" (WhatsApp) e o "Solicitar W.O." de quem joga a
partida — SHALL permanecer inalterados, assim como o "Fechar rodada" (ação de rodada, não de
partida).

#### Scenario: Partida com proposta pendente esconde a edição direta

- **WHEN** o organizador vê uma partida competitiva cujo id está no conjunto de partidas com
  proposta pendente
- **THEN** os botões "Editar placar", "Encerrar" e "W.O." dessa partida NÃO são exibidos, e no
  lugar aparece o indicador "Aguardando aprovação de placar"

#### Scenario: Partida sem pendência preserva os controles

- **WHEN** o organizador vê uma partida competitiva cujo id NÃO está no conjunto de partidas com
  proposta pendente
- **THEN** os controles do console do organizador ("Editar placar", "Encerrar", "W.O.") são
  exibidos normalmente, como antes desta mudança

#### Scenario: Fetcher expõe o matchId da proposta

- **WHEN** `getPropostasPendentes` monta a lista de propostas pendentes de um torneio
- **THEN** cada `PropostaPendente` inclui o `matchId` da partida à qual a proposta se refere,
  permitindo à page derivar o conjunto de partidas com pendência

### Requirement: Edição direta de placar é recusada no servidor com proposta pendente

A Server Action `updateMatchScore` (`src/actions/match.ts`) SHALL recusar a gravação DIRETA de
placar de uma partida competitiva quando existe uma **proposta de placar PENDENTE** para ela,
retornando `{ok:false, error:"..."}` com mensagem clara (aprovar/rejeitar antes de editar direto)
em vez de gravar por cima da proposta. Esta é a defesa em profundidade que fecha a corrida da
aba velha / POST direto (a UI já esconde o botão, mas a action é alcançável fora dela). A
verificação SHALL rodar ANTES do UPDATE e SHALL ser escopada ao caminho NÃO-avulso (o avulso não
tem propostas), para não custar uma viagem extra ao banco no caminho comum. O placar SHALL
permanecer inalterado quando a recusa ocorre.

#### Scenario: Árbitro é recusado ao editar direto com proposta pendente

- **WHEN** quem arbitra tenta gravar o placar direto de uma partida competitiva que tem uma
  proposta de placar pendente
- **THEN** `updateMatchScore` retorna `{ok:false}` com mensagem pedindo aprovar/rejeitar a
  proposta antes, e NENHUM UPDATE é feito

#### Scenario: Sem proposta pendente, a gravação direta segue normal

- **WHEN** quem arbitra grava o placar direto de uma partida competitiva SEM proposta pendente
- **THEN** o placar é gravado normalmente (a guarda não intercepta)
