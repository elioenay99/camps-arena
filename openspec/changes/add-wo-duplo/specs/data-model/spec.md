## MODIFIED Requirements

### Requirement: Colunas de W.O. em matches
A tabela `matches` SHALL ter `wo boolean not null default false`, `wo_vencedor uuid null` (FK `tournament_slots`, `on delete restrict`) e `wo_duplo boolean not null default false` (migração aditiva, sem backfill — todo registro legado nasce `wo_duplo = false`). Uma CHECK `matches_wo_coerente` SHALL impor TRÊS formas coerentes: (1) fora de W.O. — `wo` falso ⇒ `wo_vencedor` nulo e `wo_duplo` falso; (2) W.O. simples — `wo` verdadeiro e `wo_duplo` falso ⇒ `wo_vencedor` não-nulo, `placar_1 = 0`, `placar_2 = 0` e `wo_vencedor` ∈ {`vaga_1`, `vaga_2`}; (3) duplo W.O. — `wo` verdadeiro e `wo_duplo` verdadeiro ⇒ `wo_vencedor` nulo, `placar_1 = 0`, `placar_2 = 0`, `posicao` nula E `vaga_1` e `vaga_2` não nulos (o `posicao is null` é o BACKSTOP no banco contra duplo em partida de chave; o `vaga_1/vaga_2 is not null` é defesa em profundidade — simetria com o ramo simples, já que a action exige os dois lados presentes: não há duplo em bye/vaga vazia). A coluna `wo_duplo` SHALL ser imutável em `encerrada → encerrada` (trigger `lock_match_lifecycle`, ao lado de `wo`/`wo_vencedor`), permanecendo livre na reabertura (status sai de `encerrada`).

#### Scenario: Estado normal
- **WHEN** uma partida não é W.O.
- **THEN** `wo` é falso, `wo_vencedor` é nulo e `wo_duplo` é falso

#### Scenario: W.O. simples coerente
- **WHEN** uma partida é W.O. simples
- **THEN** placar é 0x0, `wo_vencedor` é um dos lados, `wo_duplo` é falso e a CHECK aceita

#### Scenario: Duplo W.O. coerente fora de chave
- **WHEN** uma partida fora de chave (`posicao` nula) é duplo W.O.
- **THEN** placar é 0x0, `wo_duplo` é verdadeiro, `wo_vencedor` é nulo e a CHECK aceita

#### Scenario: Duplo W.O. em chave é rejeitado pelo banco
- **WHEN** uma escrita tenta gravar `wo_duplo = true` numa partida de chave (`posicao` não nula), ou um duplo com `wo_vencedor` não-nulo, ou um duplo com `vaga_1` ou `vaga_2` nula (bye/vaga vazia)
- **THEN** a CHECK `matches_wo_coerente` rejeita a operação
