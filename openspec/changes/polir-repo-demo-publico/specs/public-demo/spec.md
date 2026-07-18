## MODIFIED Requirements

### Requirement: Perfil fictício simula apenas permissões de interface

A demonstração SHALL oferecer um seletor de perfil fictício
(`visitante | tecnico | gestor | admin`) que altera SOMENTE a visibilidade/habilitação de
controles de gestão na interface (flags `podeGerir`/`podeModerar`). Trocar de perfil NÃO SHALL
criar sessão, autenticar, nem chamar endpoint. O perfil simulado SHALL ser identificado
permanentemente (chip no ribbon/nav).

O gate `podeGerir` SHALL ser aplicado de forma CONSISTENTE em TODAS as telas da demonstração
que expõem ações de gestão — incluindo a lista de Torneios e a página Explorar. Em nenhuma
tela um perfil sem `podeGerir` (ex.: "visitante" ou "tecnico") SHALL enxergar controles de
criação, edição, exclusão, mudança de status ou toggle de listagem.

#### Scenario: Perfil gestor revela controles de gestão (desabilitados/rotulados)
- **WHEN** o visitante troca para o perfil "gestor"
- **THEN** os controles de gestão aparecem conforme a permissão simulada, sem que nenhuma sessão seja criada

#### Scenario: Perfil visitante esconde ações de gestão
- **WHEN** o visitante troca para "visitante"
- **THEN** as ações de gestão ficam ocultas/desabilitadas, sem chamar nada real

#### Scenario: Lista de torneios esconde gestão para quem não pode gerir
- **WHEN** o perfil ativo é "visitante" ou "tecnico" (sem `podeGerir`) na lista de Torneios da demonstração
- **THEN** os controles "Criar torneio", "Editar", "Excluir" e o select "Mudar status" ficam ocultos

#### Scenario: Explorar esconde o toggle de listagem para quem não pode gerir
- **WHEN** o perfil ativo é "visitante" ou "tecnico" (sem `podeGerir`) na página Explorar da demonstração
- **THEN** o toggle "listar" de cada card fica oculto (o card permanece read-only)

#### Scenario: Perfil gestor/admin mantém o toggle de listagem
- **WHEN** o perfil ativo tem `podeGerir` (ex.: "gestor" ou "admin") na página Explorar
- **THEN** o toggle "listar" de cada card permanece disponível e alterna o estado local otimista
