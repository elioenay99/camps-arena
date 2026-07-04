## ADDED Requirements

### Requirement: foto_path de proposta de placar amarrado à pasta do autor

A RLS de INSERT de `match_score_proposals` SHALL amarrar a coluna `foto_path` (que é
`NOT NULL`) à pasta do autor no bucket de evidências, na policy
`match_score_proposals_insert_tecnico`: o primeiro segmento de pasta SHALL ser o
`auth.uid()` do submissor e o
segundo SHALL ser o `match_id` da proposta — i.e.
`(storage.foldername(foto_path))[1] = (select auth.uid())::text` e
`(storage.foldername(foto_path))[2] = match_id::text`, além de preservar
`submetido_por = (select auth.uid())` e a elegibilidade (partida liberada, aberta,
jogador de uma das vagas). Isso SHALL impedir que um cliente que pule a Server Action
insira uma linha cujo `foto_path` aponte para a pasta de OUTRO usuário (confused
deputy: a SELECT policy de `match_evidence` concederia leitura daquele objeto a quem
enxerga a proposta). O path emitido pela action (`<uid>/<match_id>/<uuid>.<ext>`)
SHALL satisfazer o critério — nenhum insert legítimo é rejeitado.

#### Scenario: Insert com foto na própria pasta é aceito

- **WHEN** o técnico propõe placar com `foto_path = <seu-uid>/<match_id>/<uuid>.jpg`
  numa partida liberada e aberta em que ele joga
- **THEN** a RLS aceita o INSERT

#### Scenario: Insert com foto na pasta de outro é negado

- **WHEN** um cliente insere `match_score_proposals` direto no PostgREST com
  `foto_path` cujo primeiro segmento não é o `auth.uid()` dele (ou cujo segundo
  segmento não é o `match_id`)
- **THEN** a RLS nega o INSERT

## MODIFIED Requirements

### Requirement: RLS de match_wo_requests
A tabela `match_wo_requests` SHALL ter RLS estrita. INSERT SHALL ser permitido
apenas ao técnico de um dos slots da partida referenciada, com torneio ATIVO e
partida ABERTA (via função SECURITY DEFINER que espelha a lógica de
participação por vaga). Quando `foto_path` for informado (é OPCIONAL nesta tabela),
o INSERT SHALL amarrá-lo à pasta do autor: `foto_path is null` OU
`(storage.foldername(foto_path))[1] = (select auth.uid())::text` e
`(storage.foldername(foto_path))[2] = match_id::text` — impedindo que um cliente que
pule a Server Action registre uma solicitação cujo `foto_path` aponte para a pasta de
OUTRO usuário. SELECT SHALL devolver a solicitação ao técnico
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

#### Scenario: Foto opcional amarrada à pasta do autor
- **WHEN** um cliente insere uma solicitação de W.O. com `foto_path` cujo primeiro
  segmento não é o `auth.uid()` dele (ou cujo segundo segmento não é o `match_id`)
- **THEN** a RLS nega o INSERT; uma solicitação sem foto (`foto_path is null`) ou com
  a foto na pasta `<uid>/<match_id>/` continua aceita

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

Todo bucket de Storage (público ou privado) SHALL declarar `file_size_limit` e
`allowed_mime_types` no próprio bucket, batendo com os limites validados na Server Action
correspondente — de modo que um cliente que pule a action não consiga subir arquivo de tipo
ou tamanho arbitrário direto no Storage. Em particular, o bucket público `avatars` SHALL ter
`file_size_limit = 2097152` (2 MiB) e `allowed_mime_types` cobrindo `image/jpeg`,
`image/png`, `image/webp` e `image/gif` (os tipos aceitos por `atualizarAvatar`/`AvatarUpload`),
mantendo `public = true`.

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

#### Scenario: Bucket avatars rejeita tipo/tamanho fora do limite

- **WHEN** um cliente que pule a action tenta subir no bucket `avatars` um arquivo maior que
  2 MiB ou de MIME fora de `{image/jpeg, image/png, image/webp, image/gif}`
- **THEN** o Storage recusa o upload pelos limites declarados no bucket
