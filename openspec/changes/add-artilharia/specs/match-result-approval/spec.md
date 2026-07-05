## MODIFIED Requirements

### Requirement: Proposta de placar com foto pelo não-admin

O sistema SHALL exigir que, em campeonatos competitivos (torneio/liga), um técnico de vaga sem
capacidade de arbitrar envie uma proposta de placar pendente, com foto de evidência obrigatória,
em vez de gravar o placar da partida diretamente. O técnico competitivo SHALL ser impedido de
gravar o placar direto (a RLS de participante passa a valer só para o avulso). Cada técnico SHALL
ter no máximo uma proposta pendente por partida (reenviar substitui a própria pendente).

A proposta SHALL poder carregar OPCIONALMENTE os autores dos gols (`autores:
{lado, jogador, gols}[]`, mesma validação do lançamento direto — nome `btrim`
1..60, gols 1..99, soma por lado ≤ placar, sem duplicata no lado), guardados na
coluna `match_score_proposals.autores` até a resolução. O técnico NÃO SHALL
escrever `match_goals` diretamente (a RLS nega); os autores só entram na tabela
oficial na aprovação.

#### Scenario: Técnico envia placar com foto

- **WHEN** o técnico de uma vaga ajusta o placar e anexa uma foto no menu da partida
- **THEN** é criada uma proposta pendente com o placar e a foto, sem alterar o placar oficial da partida

#### Scenario: Placar sem foto é recusado

- **WHEN** o técnico tenta enviar a proposta de placar sem anexar foto
- **THEN** o envio é recusado (a foto é obrigatória)

#### Scenario: Técnico competitivo não grava placar direto

- **WHEN** um técnico de vaga tenta gravar o placar da partida competitiva diretamente
- **THEN** a operação é negada (RLS/ação); o caminho é a proposta com aprovação

#### Scenario: Proposta carrega autores dos gols

- **WHEN** o técnico envia a proposta com autores de gols válidos
- **THEN** os autores ficam guardados na proposta (coluna `autores`), sem tocar `match_goals` ainda

### Requirement: Aprovação aplica o placar e encerra; rejeição devolve

Quem tem capacidade de **arbitrar** (dono/admin/árbitro) SHALL ver as propostas pendentes e poder
**aprovar** ou **rejeitar**. Aprovar uma proposta de placar SHALL aplicar o placar proposto e
**encerrar** a partida no mesmo passo (reusando as regras de encerramento: varredura de órfãos da
rodada e validação de mata-mata), e SHALL resolver as demais propostas pendentes da partida.
Rejeitar SHALL registrar um **motivo** e devolver para o técnico poder reenviar. O aprovador SHALL
continuar podendo **lançar o placar diretamente** (sem foto) e encerrar como antes.

A aprovação SHALL, no MESMO passo atômico (RPC SECURITY DEFINER
`aprovar_proposta_placar`), materializar os autores guardados na proposta em
`match_goals` (delete-then-insert por `match_id`, agregando por `(lado, nome
normalizado)`), de modo que placar e autores fiquem consistentes. Proposta sem
autores SHALL limpar os autores da partida na materialização. A rejeição SHALL
descartar os autores propostos junto com a proposta.

#### Scenario: Aprovar aplica e encerra

- **WHEN** o aprovador aprova uma proposta de placar pendente
- **THEN** o placar proposto vira o placar oficial e a partida é encerrada; as outras propostas pendentes daquela partida são resolvidas

#### Scenario: Aprovar materializa os autores atomicamente

- **WHEN** o aprovador aprova uma proposta que trazia autores de gols
- **THEN** os autores viram linhas em `match_goals` no mesmo passo em que o placar é aplicado e a partida encerrada

#### Scenario: Rejeitar com motivo

- **WHEN** o aprovador rejeita uma proposta informando o motivo
- **THEN** a proposta fica rejeitada com o motivo e o técnico pode enviar uma nova

#### Scenario: Aprovador lança direto sem foto

- **WHEN** o dono/admin/árbitro lança o placar pelo menu da partida
- **THEN** o placar é gravado diretamente, sem exigir foto
