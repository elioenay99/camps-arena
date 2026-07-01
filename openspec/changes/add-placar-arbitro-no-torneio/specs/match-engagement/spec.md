# match-engagement — Delta Spec

## ADDED Requirements

### Requirement: Lançamento de placar pelo organizador na listagem de partidas

A listagem de partidas EM ABERTO (aba "Partidas" da página do torneio) SHALL oferecer, a quem
ORGANIZA o campeonato (dono/admin/árbitro — a mesma capacidade que habilita "Encerrar"/"W.O."),
um controle por partida que abre o "Menu da Partida" em **modo direto** para LANÇAR o placar,
reusando o modal existente (`match-score-modal`) e persistindo via a Server Action de
atualização de placar. O controle SHALL aparecer tanto em partidas COMPETITIVAS quanto AVULSAS
em aberto (agendada ou em andamento) e SHALL ficar junto do controle "Encerrar".

O controle NÃO SHALL aparecer para quem não organiza (jogador ou visitante) — para esses, a
listagem permanece inalterada (placar apenas exibido; propor placar continua sendo o fluxo do
técnico pelo "Menu da Partida" do dashboard). A autorização real SHALL permanecer no servidor
(Server Action + RLS); o controle é apenas descoberta/UX. O modal aberto por este controle NÃO
SHALL oferecer busca de clube nem expor telefone (sem lado convocável) — o atalho de convocação
segue no botão "Chamar" da própria linha, com a PII embutida no link no servidor. Partidas
ENCERRADAS SHALL permanecer imutáveis por aqui (correção pelo caminho "Reabrir", que devolve a
partida à listagem em aberto). A paginação por rodada (passador) e a lista plana do avulso SHALL
seguir inalteradas.

#### Scenario: Organizador lança o placar pela aba Partidas

- **WHEN** o dono/admin/árbitro vê uma partida em aberto na aba "Partidas"
- **THEN** um controle abre o "Menu da Partida" em modo direto e salva o placar da partida

#### Scenario: Jogador e visitante não veem o controle

- **WHEN** quem não organiza o campeonato vê a listagem de partidas em aberto
- **THEN** nenhum controle de lançar placar é renderizado (o placar segue apenas exibido)

#### Scenario: Modal do organizador não convoca nem escolhe clube

- **WHEN** o organizador abre o "Menu da Partida" por este controle
- **THEN** o modal permite lançar o placar, sem campo de busca de clube e sem botão de WhatsApp
  interno (o "Chamar" continua na linha da partida)

#### Scenario: Partida encerrada exige reabrir

- **WHEN** o organizador quer corrigir o placar de uma partida já encerrada
- **THEN** ele reabre a partida (histórico), que volta à listagem em aberto e reexibe o controle
  de lançar placar

#### Scenario: Lançar placar não transiciona partida agendada

- **WHEN** o organizador lança o placar de uma partida ainda "agendada"
- **THEN** o placar é gravado mas o status permanece "agendada" (a finalização segue exigindo
  "Encerrar"); a classificação, que só pontua partidas encerradas, não é afetada

#### Scenario: Lançamento direto não descarta proposta pendente

- **WHEN** existe uma proposta de placar pendente de um técnico e o organizador lança o placar
  direto
- **THEN** o placar é gravado, mas a proposta pendente permanece em "Resultados pendentes" até o
  organizador aprová-la ou rejeitá-la
