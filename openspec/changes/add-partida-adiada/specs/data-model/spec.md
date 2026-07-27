## ADDED Requirements

### Requirement: Colunas de adiamento em matches
A tabela `matches` SHALL ter um quarto valor no enum `match_status`: `adiada` (aditivo — `alter type ... add value if not exists`, aplicado em statement top-level, fora de bloco `do $$ ... $$` e isolado do restante da migração, já que o Postgres proíbe usar um valor de enum recém-criado na mesma transação em que foi adicionado). A tabela SHALL ganhar três colunas nullable, sem backfill (todo registro legado nasce com os três nulos): `adiada_em timestamptz`, `adiada_por uuid` (FK `public.users`, `on delete set null`) e `adiamento_motivo text`. Uma CHECK `matches_adiamento_coerente` SHALL exigir, UNIDIRECIONALMENTE, que `status = 'adiada'` implique `adiada_em` e `adiada_por` não-nulos — SEM exigir o inverso (os três campos podem permanecer preenchidos como metadado histórico quando a partida sai de `adiada` para `encerrada` pelos caminhos normais de placar/W.O., que não são alterados por esta capability). As três colunas SHALL ser imutáveis em `encerrada → encerrada` (trigger `lock_match_lifecycle`, ao lado de `wo`/`wo_vencedor`/`wo_duplo`), permanecendo livres fora desse estado (inclusive na reversão explícita do adiamento, que as limpa).

#### Scenario: Adiar grava os três campos
- **WHEN** uma partida é adiada
- **THEN** `status` vira `adiada` e `adiada_em`/`adiada_por` ficam não-nulos (o motivo é opcional)

#### Scenario: CHECK rejeita adiada sem metadado
- **WHEN** uma escrita tenta gravar `status = 'adiada'` com `adiada_em` ou `adiada_por` nulos
- **THEN** a CHECK `matches_adiamento_coerente` rejeita a operação

#### Scenario: Metadado sobrevive à resolução normal
- **WHEN** uma partida `adiada` é resolvida por placar ou W.O. (sem passar pela reversão do adiamento)
- **THEN** ela encerra normalmente e os campos `adiada_em`/`adiada_por`/`adiamento_motivo` permanecem como registro histórico

#### Scenario: Reverter o adiamento limpa o metadado
- **WHEN** o adiamento de uma partida é revertido explicitamente
- **THEN** `status` volta ao aberto normal e `adiada_em`/`adiada_por`/`adiamento_motivo` ficam nulos

#### Scenario: Coluna de adiamento imutável em partida encerrada
- **WHEN** uma escrita tenta alterar `adiada_em`, `adiada_por` ou `adiamento_motivo` numa partida que permanece `encerrada`
- **THEN** o trigger `lock_match_lifecycle` rejeita a operação
