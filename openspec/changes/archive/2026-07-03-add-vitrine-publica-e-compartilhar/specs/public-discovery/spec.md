## ADDED Requirements

### Requirement: Vitrine pública "Explorar"

O sistema SHALL oferecer a página protegida `/dashboard/explorar` que agrega, de
QUALQUER usuário, as competições publicadas na vitrine: as **ligas com
`status = 'ativa'` e `listada = true`** e os **torneios com `is_public = true` e
`listada = true` que são de TOPO** (não são divisão de pirâmide). A página SHALL
exigir sessão: sem usuário autenticado, SHALL redirecionar para o login
(`/login?redirectTo=/dashboard/explorar`). A visibilidade das linhas SHALL ficar
a cargo da RLS já existente (liga `ativa`/torneio `is_public` são legíveis por
qualquer logado); `listada` é um flag de PUBLICAÇÃO opt-in, não uma fronteira de
segurança.

Cada competição SHALL ser exibida como um card com título, badge de formato,
status, as cores do campeonato (reuso do tema/`ChampionshipBadge`) e o nome do
dono, ordenado do mais recente para o mais antigo. O card SHALL linkar para a
visão de leitura: a página da temporada CORRENTE da liga
(`/dashboard/ligas/[season_id]`, resolvendo a temporada de maior número) ou a
página do torneio (`/dashboard/torneios/[id]`). Quando nenhuma competição estiver
publicada, a página SHALL exibir um estado vazio ("Nenhuma competição pública
ainda.").

Os torneios de DIVISÃO de pirâmide SHALL ser EXCLUÍDOS da vitrine (um torneio é
divisão quando está referenciado por `league_division_seasons` em
`tournament_id`, `tournament_id_clausura` ou `final_tournament_id`), mesmo que
tivessem `listada = true` — uma divisão só alcança o público pelo card da
liga-mãe.

#### Scenario: Logado vê competições publicadas de terceiros

- **WHEN** um usuário autenticado abre `/dashboard/explorar` e existem ligas
  ativas e torneios públicos de OUTROS usuários com `listada = true`
- **THEN** a página exibe um card por competição (liga e torneio), ordenados do
  mais recente ao mais antigo, cada um com link para a sua visão de leitura

#### Scenario: Divisão de pirâmide nunca aparece como card

- **WHEN** um torneio que é divisão de uma pirâmide está com `is_public = true`
  (herdado) e, por qualquer via, `listada = true`
- **THEN** a vitrine NÃO exibe esse torneio como card avulso (ele é excluído pelo
  `not exists` em `league_division_seasons`); a divisão chega ao público apenas
  pelo card da liga-mãe

#### Scenario: Liga arquivada some da vitrine

- **WHEN** uma liga que estava publicada (`listada = true`) é arquivada
  (`status != 'ativa'`)
- **THEN** ela deixa de aparecer na vitrine (o loader filtra `status = 'ativa'`)

#### Scenario: Torneio que deixa de ser público some

- **WHEN** um torneio publicado (`listada = true`) tem `is_public` desmarcado
- **THEN** ele deixa de aparecer na vitrine (o loader exige `is_public = true` E
  `listada = true`)

#### Scenario: Vitrine vazia

- **WHEN** nenhuma competição está publicada na vitrine
- **THEN** a página exibe o estado vazio "Nenhuma competição pública ainda.", sem
  erro

#### Scenario: Acesso sem sessão é redirecionado

- **WHEN** uma requisição sem usuário autenticado chega a `/dashboard/explorar`
- **THEN** a página redireciona para `/login?redirectTo=/dashboard/explorar`

### Requirement: Entrada de navegação "Explorar"

O shell autenticado SHALL incluir o link "Explorar" para `/dashboard/explorar` na
navegação persistente, com estado ativo por prefixo de rota.

#### Scenario: Link no nav

- **WHEN** o usuário está em qualquer página autenticada
- **THEN** o nav exibe "Explorar" e o marca ativo nas rotas `/dashboard/explorar*`
