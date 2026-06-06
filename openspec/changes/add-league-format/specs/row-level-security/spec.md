# row-level-security Specification (delta)

## MODIFIED Requirements

### Requirement: Criação de partida restrita ao dono do torneio
O sistema SHALL permitir INSERT em `matches` apenas quando o usuário autenticado for o dono (`created_by`) do torneio referenciado em `tournament_id`, o torneio não estiver `encerrado`, cada participante informado (não nulo) for participante confirmado do torneio em `participants` E o formato for respeitado: em torneio `avulso`, INSERT livre dessas condições; em torneio `liga`, apenas INSERT com `rodada` preenchida (caminho da geração da tabela — partida manual sem rodada é barrada). As demais operações de escrita não cobertas por policy permanecem negadas.

#### Scenario: Dono cria partida no próprio torneio
- **WHEN** o dono de um torneio avulso não encerrado insere uma partida com participantes do torneio (ou nulos)
- **THEN** a inserção é aceita

#### Scenario: Terceiro não cria partida em torneio alheio
- **WHEN** um usuário autenticado tenta inserir partida em torneio cujo dono é outra pessoa
- **THEN** a política RLS rejeita a operação

#### Scenario: Torneio encerrado não recebe partidas
- **WHEN** o dono tenta inserir partida em torneio com status `encerrado`
- **THEN** a política RLS rejeita a operação

#### Scenario: Participante fora da lista é barrado no banco
- **WHEN** um INSERT direto referencia como participante um usuário que não está em `participants` do torneio
- **THEN** a política RLS rejeita a operação

#### Scenario: Geração da liga passa pela policy
- **WHEN** o dono insere as partidas geradas (com `rodada`) numa liga em rascunho
- **THEN** a inserção é aceita

#### Scenario: Partida manual em liga é barrada no banco
- **WHEN** um INSERT direto sem `rodada` é tentado em torneio de formato liga
- **THEN** a política RLS rejeita a operação

### Requirement: Funções SECURITY DEFINER de convite
O sistema SHALL definir as funções `eh_participante(uuid)`, `aceitar_convite(text)` e `info_convite(text)` como `SECURITY DEFINER` com `search_path = ''`.
`aceitar_convite` SHALL exigir usuário autenticado, validar o código, rejeitar
torneio `encerrado`, rejeitar liga já iniciada (`formato = 'liga'` com
`status <> 'rascunho'`) e inserir SOMENTE o próprio `auth.uid()` de forma
idempotente. `info_convite` SHALL expor apenas dados mínimos do torneio
(id, título, status, formato, se já participa) a partir de um código válido.
A recriação das funções SHALL re-aplicar REVOKE/GRANT explícitos (CREATE
FUNCTION concede EXECUTE a PUBLIC): `eh_participante` para anon+authenticated;
funções de convite apenas para authenticated.

#### Scenario: Aceite sem sessão é rejeitado
- **WHEN** `aceitar_convite` é chamada sem usuário autenticado
- **THEN** a função falha sem inserir nada

#### Scenario: Função não insere terceiros
- **WHEN** `aceitar_convite` é executada
- **THEN** a única linha possível de inserção é a do próprio `auth.uid()`

#### Scenario: Código inválido falha de forma única
- **WHEN** `aceitar_convite` ou `info_convite` recebem código inexistente
- **THEN** a resposta não distingue inexistente de revogado

#### Scenario: Liga iniciada rejeita aceite no banco
- **WHEN** `aceitar_convite` é chamada com código de liga cujo status não é `rascunho`
- **THEN** a função falha com mensagem clara e nada é inserido

#### Scenario: Grants re-aplicados na recriação
- **WHEN** as funções são recriadas pela DDL desta change
- **THEN** `anon` não executa `aceitar_convite`/`info_convite` e as policies seguem avaliando `eh_participante` para anon e authenticated
