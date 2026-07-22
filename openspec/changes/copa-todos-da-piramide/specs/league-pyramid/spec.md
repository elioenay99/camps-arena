## ADDED Requirements

### Requirement: Seção consolidada de copas na página da pirâmide
A página da pirâmide (`/dashboard/ligas/[id]`) SHALL exibir uma seção "Copas" listando as copas
alimentadas por aquela pirâmide — as `cup_competitions` que têm ao menos uma regra de qualificação
com `origem_competition_id` igual à pirâmide (origens `divisao` e `divisao_todos`). A listagem SHALL
respeitar a visibilidade/RLS (copa pública OU do próprio dono) e SHALL ser **somente leitura**
(ZERO-DDL: nenhuma tabela ou coluna nova). A seção SHALL seguir o padrão visual das demais seções da
página e as diretrizes mobile-first (alvos 44px, `text-base`, sem `shrink-0` esmagando).

#### Scenario: Copas alimentadas pela pirâmide aparecem
- **WHEN** existe uma copa com regra de origem (`divisao` ou `divisao_todos`) apontando para esta
  pirâmide, visível ao usuário
- **THEN** a seção "Copas" da página da pirâmide lista essa copa (nome + link), sem duplicar quando a
  copa tem várias regras da mesma pirâmide

#### Scenario: Sem copas vinculadas
- **WHEN** nenhuma copa referencia esta pirâmide como origem
- **THEN** a seção exibe um empty-state ("nenhuma copa alimentada por esta pirâmide")

#### Scenario: Visibilidade respeitada
- **WHEN** uma copa que referencia a pirâmide é privada de terceiro
- **THEN** ela NÃO aparece na seção para quem não é o dono da copa (RLS/visibilidade preservada)
