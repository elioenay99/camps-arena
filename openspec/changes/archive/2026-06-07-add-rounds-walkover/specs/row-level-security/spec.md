# row-level-security — Delta Spec

## ADDED Requirements

### Requirement: RLS de match_wo_requests
A tabela `match_wo_requests` SHALL ter RLS estrita. INSERT SHALL ser permitido
apenas ao técnico de um dos slots da partida referenciada, com torneio ATIVO e
partida ABERTA (via função SECURITY DEFINER que espelha a lógica de
participação por vaga). SELECT SHALL devolver a solicitação ao técnico
solicitante E ao dono do torneio. UPDATE do veredito (`status`/`resolved_at`)
SHALL ser permitido apenas ao dono do torneio. DELETE SHALL ser negado a todos
(histórico imutável; service_role livre).

#### Scenario: Só o adversário solicita
- **WHEN** alguém que não é técnico de nenhum lado da partida tenta inserir uma
  solicitação
- **THEN** a RLS nega

#### Scenario: Só o dono resolve
- **WHEN** quem não é dono tenta atualizar o status de uma solicitação
- **THEN** a RLS nega


### Requirement: UPDATE de partida pelo dono cobre o W.O.
A policy `matches_update_tournament_owner` SHALL permitir ao dono gravar
`wo`/`wo_vencedor` junto com `status`/`placar` no mesmo UPDATE (marcar W.O.).
O trigger `lock_match_lifecycle` SHALL continuar barrando alteração de placar
de partida JÁ encerrada — marcar W.O. é sobre partida ABERTA (encerra na mesma
transação, `old.status <> 'encerrada'`).

#### Scenario: Dono marca W.O. em partida aberta
- **WHEN** o dono grava `wo=true, wo_vencedor, placar 0x0, status=encerrada`
  numa partida aberta do seu torneio ativo
- **THEN** a RLS e os triggers aceitam

#### Scenario: Não-dono não marca W.O.
- **WHEN** um técnico tenta gravar W.O. por POST direto
- **THEN** a policy de UPDATE do dono nega (técnico só altera placar do
  próprio lado, não `wo`)
