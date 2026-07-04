## MODIFIED Requirements

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

## ADDED Requirements

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
