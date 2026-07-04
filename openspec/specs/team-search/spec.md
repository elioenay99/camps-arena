# team-search Specification

## Purpose
Buscar clubes reais de futebol por nome (autocomplete via API-Football), associar o clube a cada lado da partida e exibir o escudo, com a chave da API protegida no servidor e cache local dos clubes selecionados. Modelagem aditiva: o participante continua sendo o usuário, preservando a autorização de placar.
## Requirements
### Requirement: Busca de clube por nome
O sistema SHALL fornecer uma Server Action que recebe um termo de busca e retorna uma lista de clubes reais (nome + URL do escudo) obtidos de uma API de futebol, com a chave da API mantida exclusivamente no servidor. A action SHALL exigir uma sessão autenticada e NÃO SHALL chamar a API externa para requisições não autenticadas, evitando que visitantes anônimos esgotem a cota da API.

#### Scenario: Resultados retornados
- **WHEN** o organizador autenticado digita ao menos 3 caracteres do nome de um clube
- **THEN** a action consulta a API e retorna os clubes correspondentes, cada um com nome e URL do escudo

#### Scenario: Termo curto demais
- **WHEN** o termo de busca tem menos de 3 caracteres
- **THEN** nenhuma chamada à API é feita e a lista retornada é vazia

#### Scenario: Falha da API
- **WHEN** a chamada à API falha ou expira
- **THEN** a action retorna erro tratado, sem expor detalhes internos nem a chave da API ao cliente

#### Scenario: Busca sem sessão é rejeitada
- **WHEN** a Server Action de busca é invocada sem uma sessão autenticada (ex.: POST direto à action)
- **THEN** a action retorna erro de autenticação e NÃO chama a API externa, fechando o vetor de esgotar a cota anonimamente

### Requirement: Chave da API protegida no servidor
A chave da API de futebol SHALL existir apenas no servidor (sem prefixo `NEXT_PUBLIC_`) e NUNCA SHALL ser enviada ao cliente.

#### Scenario: Chave ausente do bundle do cliente
- **WHEN** o componente de busca roda no navegador
- **THEN** a chave da API não está presente em nenhum payload ou bundle do cliente; a busca ocorre via Server Action no servidor

### Requirement: Seleção e cache do clube
Ao selecionar um clube, o sistema SHALL persistir o clube em um cache local (tabela `teams`: nome, URL do escudo, identificador externo, provedor), evitando rechamar a API para reexibir o mesmo clube. A action SHALL validar a entrada antes de gravar: a URL do escudo, quando presente, SHALL pertencer ao domínio confiável do provedor (`media.api-sports.io`); o nome SHALL respeitar um limite de tamanho; o identificador externo SHALL ser numérico. Entradas fora desses limites SHALL ser rejeitadas, impedindo poison do cache compartilhado. Ao cachear um clube NOVO, o sistema SHALL self-hostar o escudo no Storage próprio (best-effort) e gravar a URL do Storage; a falha do self-host NÃO SHALL bloquear o cache (grava a URL de origem). O sistema NÃO SHALL re-hospedar o escudo de um clube já cacheado.

#### Scenario: Clube novo é cacheado
- **WHEN** o organizador seleciona um clube ainda não presente no cache
- **THEN** o clube é gravado em `teams` com nome, URL do escudo, `external_id` e `provider`

#### Scenario: Clube novo tem o escudo self-hostado
- **WHEN** um clube novo com escudo é cacheado
- **THEN** o escudo é rehospedado no Storage próprio e `teams.escudo_url` recebe a URL pública do Storage (não a do CDN de terceiro)

#### Scenario: Clube já cacheado é reutilizado
- **WHEN** o organizador seleciona um clube já presente no cache (mesmo `provider` + `external_id`)
- **THEN** o registro existente é reutilizado, sem duplicar o clube e sem re-hospedar o escudo

#### Scenario: Escudo de domínio não confiável é rejeitado
- **WHEN** a seleção é invocada com uma URL de escudo fora do domínio confiável do provedor (ou com nome/identificador fora dos limites)
- **THEN** a action rejeita a entrada e NÃO grava o clube no cache

### Requirement: Associação aditiva do clube ao participante
O sistema SHALL associar um clube a cada lado da partida sem alterar o contrato de participante: o participante permanece sendo o usuário, e a autorização de lançamento de placar permanece inalterada. O sistema SHALL rejeitar associar o mesmo clube aos dois lados da partida.

#### Scenario: Clube por lado da partida
- **WHEN** uma partida tem clubes definidos para os lados
- **THEN** cada lado exibe o clube associado, enquanto `participante_1/2` continuam referenciando usuários

#### Scenario: Autorização de placar preservada
- **WHEN** um usuário lança o placar de uma partida que ele participa
- **THEN** a autorização continua baseada na identidade do usuário (RLS + checagem de propriedade), sem depender do clube

#### Scenario: Mesmo clube nos dois lados é rejeitado
- **WHEN** a associação resultaria em `time_1` e `time_2` referenciando o mesmo clube (considerando os valores atuais e o patch)
- **THEN** a action rejeita a operação e a partida não é alterada

### Requirement: Exibição do escudo com fallback
A UI SHALL exibir o escudo do clube quando disponível e SHALL apresentar um placeholder (iniciais do clube + cor) quando o escudo estiver ausente ou falhar ao carregar.

#### Scenario: Escudo disponível
- **WHEN** o clube possui URL de escudo válida
- **THEN** o escudo é exibido (imagem otimizada)

#### Scenario: Escudo ausente ou com erro
- **WHEN** o clube não tem escudo ou a imagem falha ao carregar
- **THEN** um placeholder com as iniciais do clube é exibido no lugar

### Requirement: Integridade do cache global de clubes

O sistema SHALL impor, no banco, sanidade mínima dos clubes inseridos no cache global: o nome
SHALL ter entre 1 e 80 caracteres após remover espaços nas bordas, e o identificador externo
SHALL ser nulo ou numérico. A regra SHALL valer para qualquer caminho de escrita (incluindo
acesso direto ao PostgREST), não apenas pela Server Action.

#### Scenario: Nome vazio ou grande é recusado pelo banco

- **WHEN** uma escrita tenta inserir um clube com nome vazio (só espaços) ou acima de 80 caracteres
- **THEN** o banco recusa a inserção pela restrição de integridade

#### Scenario: Cache segue aberto a usuários autenticados

- **WHEN** um usuário autenticado insere um clube válido no cache
- **THEN** a inserção é aceita (o cache de clubes permanece global e compartilhado)

### Requirement: Escudo servido do Storage próprio (sem hotlink de terceiro)
O sistema SHALL servir o escudo de clube a partir do Storage próprio, e renderizar classificação/pirâmide/partida NUNCA SHALL depender do CDN de terceiro (`media.api-sports.io`) para exibir escudos de clubes migrados. Quando o escudo estiver ausente ou falhar ao carregar, a UI SHALL apresentar o placeholder de iniciais (fallback preservado). O sistema SHALL prover um backfill que migra os registros existentes cujo escudo aponta para o CDN.

#### Scenario: Escudo migrado é servido do Storage
- **WHEN** um clube tem o escudo já rehospedado
- **THEN** `teams.escudo_url` aponta para a URL pública do bucket próprio e o navegador busca a imagem do Storage, não do CDN de terceiro

#### Scenario: Queda do rehost não bloqueia o cache
- **WHEN** o download ou o upload do escudo falha ao cachear um clube novo
- **THEN** o clube é cacheado com a URL de origem (fallback) e a operação retorna sucesso, sem quebrar o fluxo

#### Scenario: Backfill migra os escudos existentes
- **WHEN** o backfill é executado com credencial administrativa
- **THEN** cada clube com escudo no CDN (ou nulo com identificador reconstruível) tem o escudo rehospedado no Storage e `teams.escudo_url` atualizado para a URL do Storage, pulando os que já foram migrados

