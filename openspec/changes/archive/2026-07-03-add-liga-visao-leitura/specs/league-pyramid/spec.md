## ADDED Requirements

### Requirement: Visão de leitura da página da temporada para qualquer logado

A página da temporada `/dashboard/ligas/[id]` SHALL renderizar uma **visão de
leitura para qualquer usuário autenticado**, não apenas para o dono/admin da
liga. Sem sessão, a página SHALL redirecionar para o login (`redirectTo`). Com
sessão, a visibilidade SHALL ser determinada pela **RLS** (liga `ativa` é pública
para logados; `arquivada` só a equipe/dono a vê): quando a RLS não entrega a
temporada (inexistente ou invisível ao usuário), a página SHALL responder
`notFound` (404), sem oráculo de existência.

O conteúdo de competição SHALL ser visível ao leitor: classificação de todas as
divisões (com as zonas de sobe/cai), a chave de cada playoff/playout e da grande
final **conforme entregue pela RLS de partidas** (apenas rodadas liberadas de
torneios visíveis — a chave/classificação pode ser parcial ou vazia para o
leitor; o dono vê todas), e o estado das divisões. Esse comportamento SHALL ser
idêntico ao da página de torneio da divisão (sem oráculo de rodada oculta).

Os **controles de gestão** SHALL ser renderizados condicionalmente à capacidade
GERIR (`podeGerir` = dono ou admin de liga, herança incluída) e SHALL ficar
ocultos para o leitor não-gestor: montar temporada, iniciar divisão, alternar o
turno da divisão, o console de fim de temporada (fluxo de sobe/cai), os botões de
montar/avançar playoff e montar a grande final, e os atalhos de gestão do header
("Equipe", "Identidade"). Nenhum dado exclusivo de gestão (convites, códigos,
telefones) SHALL ser exposto ao leitor.

A autorização de ESCRITA NÃO SHALL ser enfraquecida: as Server Actions SHALL
continuar checando `podeGerir` pela `competition_id` real e a RLS de escrita
SHALL permanecer inalterada. As páginas irmãs de gestão (`/cores`, `/equipe`)
SHALL negar acesso ao não-gestor com `notFound` (gate próprio, já que os loaders
de leitura deixam de zerar os dados por capacidade).

#### Scenario: Jogador não-gestor vê a liga em leitura

- **WHEN** um usuário autenticado que NÃO é dono nem admin de uma liga ativa abre
  `/dashboard/ligas/[id]`
- **THEN** a página renderiza a classificação de todas as divisões, playoffs e
  grande final, sem 404, e SEM nenhum botão ou atalho de gestão

#### Scenario: Gestor vê os controles de gestão

- **WHEN** o dono ou um admin de liga abre a mesma página
- **THEN** além do conteúdo de leitura, os controles de gestão (montar, iniciar,
  turno, fluxo, playoffs, grande final, Equipe, Identidade) ficam disponíveis

#### Scenario: Usuário não autenticado é redirecionado

- **WHEN** uma requisição sem sessão chega a `/dashboard/ligas/[id]`
- **THEN** a página redireciona para `/login?redirectTo=/dashboard/ligas/[id]`

#### Scenario: Liga arquivada exige a equipe

- **WHEN** um usuário autenticado que não pertence à equipe abre uma liga
  `arquivada`
- **THEN** a RLS não entrega a temporada e a página responde `notFound` (404)

#### Scenario: Estado "não montada" é caminho de gestão, não de leitor

- **WHEN** uma temporada ainda não montada é aberta (tende a estar em `rascunho`,
  que a RLS esconde do não-equipe → 404 antes do estado read-only)
- **THEN** o estado read-only "temporada ainda não montada" (sem botão) só é
  alcançado por membro de equipe sem capacidade GERIR; o gestor, no mesmo caso, vê
  o botão de montar

#### Scenario: Página de identidade/equipe nega o não-gestor

- **WHEN** um leitor não-gestor navega para `/dashboard/ligas/[id]/cores` ou
  `/dashboard/ligas/[id]/equipe`
- **THEN** a página responde `notFound` (404)

### Requirement: Navegação da divisão para a liga-mãe

A página de um torneio de divisão de pirâmide SHALL oferecer um link para a
página da temporada da liga-mãe (`/dashboard/ligas/[season_id]`), permitindo ao
jogador da divisão alcançar a liga (o torneio é divisão quando `liga_do_torneio`
resolve a competição-mãe). O `season_id` SHALL ser resolvido a partir do torneio da divisão
(`league_division_seasons` por `tournament_id`/`tournament_id_clausura`); quando
não resolver, o link SHALL ser omitido.

#### Scenario: Link da divisão abre a liga

- **WHEN** um usuário autenticado abre um torneio que é divisão de uma pirâmide
  visível
- **THEN** a página exibe um link "Ver liga" que navega para a página da temporada
  da liga-mãe
