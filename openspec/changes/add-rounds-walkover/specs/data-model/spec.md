# data-model — Delta Spec

## ADDED Requirements

### Requirement: Colunas de W.O. em matches
A tabela `matches` SHALL ter `wo boolean not null default false` e
`wo_vencedor uuid null` (FK `tournament_slots`, `on delete restrict`). Uma
CHECK `matches_wo_coerente` SHALL impor: `wo` falso ⇒ `wo_vencedor` nulo; `wo`
verdadeiro ⇒ `wo_vencedor` não-nulo, `placar_1 = 0`, `placar_2 = 0` e
`wo_vencedor` ∈ {`vaga_1`, `vaga_2`}.

#### Scenario: Estado normal
- **WHEN** uma partida não é W.O.
- **THEN** `wo` é falso e `wo_vencedor` é nulo

#### Scenario: W.O. coerente
- **WHEN** uma partida é W.O.
- **THEN** placar é 0x0, `wo_vencedor` é um dos lados e a CHECK aceita

### Requirement: Tabela de solicitações de W.O.
SHALL existir `match_wo_requests` com `id` (PK), `match_id` (FK matches, on
delete cascade), `solicitante_slot` (FK tournament_slots), `motivo` text nulo,
`status text` em {`pendente`,`aceito`,`recusado`} default `pendente`,
`created_at` e `resolved_at` nulo. Um índice único parcial SHALL garantir no
máximo UMA solicitação `pendente` por `match_id`.

#### Scenario: Uma pendente por partida
- **WHEN** já há uma solicitação pendente para a partida
- **THEN** o índice único parcial rejeita uma segunda pendente
