# row-level-security — Delta Spec

## ADDED Requirements

### Requirement: Coluna `celular` (PII) restrita a co-participantes

O número de telefone (`public.users.celular`) é PII e NÃO SHALL ser legível por um usuário
autenticado qualquer. A coluna `celular` SHALL ser protegida por **grant de coluna** (não
pela row-policy, que permanece ampla para `nome`/`avatar`): o `SELECT` da coluna `celular`
SHALL ser revogado de `anon` e `authenticated`, restando legível apenas por caminho
`SECURITY DEFINER` que aplique o predicado de co-participação.

O sistema SHALL prover um predicado `public.eh_co_participante(uuid) → boolean`
(`SECURITY DEFINER`, `set search_path=''`, `EXECUTE` revogado de `public` e concedido a
`anon, authenticated`) que é verdadeiro quando `auth.uid()` e o argumento compartilham um
mesmo torneio por qualquer caminho de pertencimento (dono, jogador avulso ou técnico de
vaga). O sistema SHALL prover a função `public.celulares_de_contato(uuid[]) →
table(user_id uuid, celular text)` (`SECURITY DEFINER`, `EXECUTE` só para `authenticated`)
que devolve o `celular` de um id APENAS quando esse id é o próprio solicitante OU
`eh_co_participante(id)` é verdadeiro.

A row-policy `users_select_authenticated` SHALL permanecer `using (true)` para preservar a
visibilidade de `nome`/`avatar` (necessária em torneios públicos avulsos). A auto-edição do
próprio `celular` (UPDATE) e a gravação no cadastro (trigger `handle_new_user`) NÃO SHALL
ser afetadas pelo revoke de `SELECT` de coluna.

#### Scenario: Leitura direta da coluna é negada

- **WHEN** um cliente `authenticated` tenta `GET /rest/v1/users?select=id,celular`
- **THEN** a leitura da coluna `celular` é negada (sem grant), enquanto `id`/`nome`/`avatar`
  seguem legíveis

#### Scenario: Co-participante obtém o telefone pela RPC

- **WHEN** o dono de um torneio (ou o adversário numa partida) chama
  `celulares_de_contato([id_do_outro])` e ambos compartilham o torneio
- **THEN** a RPC devolve o `celular` do outro, alimentando o atalho `wa.me`

#### Scenario: Não-participante não obtém o telefone

- **WHEN** um logado que NÃO compartilha torneio com o alvo chama
  `celulares_de_contato([id_do_alvo])` (ou vê um torneio público de terceiros)
- **THEN** a RPC não devolve linha para esse id (telefone fica indisponível), embora
  `nome`/`avatar` e placares continuem visíveis

#### Scenario: Próprio telefone sempre resolve (sem torneio)

- **WHEN** um usuário sem nenhum torneio chama `celulares_de_contato([self])`
- **THEN** recebe o próprio `celular` (branch `id = auth.uid()`, independente de participação)

#### Scenario: Baseline do `anon` preservado após o revoke

- **WHEN** o papel `anon` consulta `public.users` ou a view `public.users_public` após o
  revoke do `SELECT` de coluna
- **THEN** recebe ZERO linhas pela RLS (sem policy de SELECT para `anon`), porém SEM erro de
  permissão de coluna — graças ao re-grant `select (id, nome, avatar, created_at)` a `anon`
