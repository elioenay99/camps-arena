# row-level-security — Delta Spec

## ADDED Requirements

### Requirement: Superfície mínima da API PostgREST e do Storage

O sistema SHALL minimizar a superfície exposta pela API PostgREST e pelo Storage, revogando
acessos que não correspondem a um uso público deliberado.

Funções `SECURITY DEFINER` que existem APENAS como gatilho de trigger ou como helper de
política RLS NÃO SHALL ser executáveis pelos papéis `anon`/`authenticated`/`public` via
`/rest/v1/rpc/...` — o `EXECUTE` SHALL ser revogado desses papéis. Somente RPCs deliberadamente
públicas (que validam posse/credencial internamente — ex.: `montar_*`, `aceitar_*`, `info_convite*`)
SHALL permanecer executáveis, com o papel mínimo necessário.

Views em `public` que projetam um subconjunto seguro de uma tabela com RLS SHALL usar
`security_invoker = on` (não `SECURITY DEFINER`), de modo que a RLS e os grants de coluna do
papel que consulta sejam aplicados — exceto quando houver justificativa documentada para o
contrário.

Buckets de Storage públicos NÃO SHALL ter política `SELECT` ampla em `storage.objects` que
permita LISTAR todos os arquivos; o acesso público SHALL se dar por URL de objeto.

#### Scenario: Trigger function não é chamável como RPC

- **WHEN** um cliente `anon` ou `authenticated` tenta `POST /rest/v1/rpc/lock_match_lifecycle`
  (ou qualquer outra função de trigger/helper de RLS)
- **THEN** a chamada é negada por falta de `EXECUTE`, enquanto o trigger correspondente continua
  disparando normalmente nas operações de tabela

#### Scenario: View de perfil público respeita a RLS do consumidor

- **WHEN** a view `public.users_public` é consultada
- **THEN** ela roda com `security_invoker = on`, aplicando a RLS e os grants de coluna do papel
  que consulta, sem expor colunas sensíveis (ex.: `celular`) além do projetado

#### Scenario: Bucket público não permite listagem

- **WHEN** um cliente tenta listar os arquivos do bucket `avatars`
- **THEN** a listagem é negada (não há política SELECT ampla), mas cada objeto continua acessível
  pela sua URL pública
