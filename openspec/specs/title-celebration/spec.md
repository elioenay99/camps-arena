# title-celebration Specification

## Purpose
TBD - created by archiving change add-frente-compartilhavel. Update Purpose after archive.
## Requirements
### Requirement: Celebração ativa só quando uma chave coroa um campeão

Quando uma chave decide um CAMPEÃO, o app SHALL exibir uma comemoração ATIVA e única
(burst de confete) sobre o destaque do campeão, colorida pela cor do campeonato
(`resolverCoresTorneio`). A
celebração SHALL ser ancorada DENTRO do `BracketView`, que passa a receber apenas
props serializáveis novas: `cor` (de `resolverCoresTorneio`) e `celebrarCampeao`
(boolean). Como `GrandeFinalPanel` embute o `BracketView` como `ReactNode`, essa única
ancoragem SHALL cobrir final de torneio, final de copa e grande final de divisão de
liga. O componente de celebração SHALL ser client e NÃO SHALL receber JSX de
client-component atravessando a fronteira RSC (lição `e559a9f`). A celebração SHALL
disparar uma vez por decisão (não a cada `router.refresh`/renavegação), usando um
guard por identificador da chave (`sessionStorage`).

`celebrarCampeao` SHALL ser verdadeiro APENAS em chaves que coroam título (final de
torneio, final de copa, grande final de divisão) e SHALL ser falso em playoff de
acesso, playout e barragem — mesmo que essas também usem bracket, elas decidem
promoção/rebaixamento, não título. Cada call-site (`torneios/[id]/page.tsx`,
`copas/edicao/[id]/page.tsx`, `ligas/[id]/page.tsx`) SHALL definir o flag conforme seu
contexto.

#### Scenario: Campeão de torneio/copa é comemorado
- **WHEN** a final de um torneio ou copa é decidida e o `BracketView` mostra o campeão
- **THEN** um burst de confete na cor do campeonato dispara uma vez sobre o destaque

#### Scenario: Grande final de divisão é comemorada
- **WHEN** a grande final de uma divisão de liga é decidida (via `GrandeFinalPanel`, que embute o `BracketView`)
- **THEN** a celebração ativa dispara com a cor do campeonato

#### Scenario: Playoff/playout/barragem NÃO celebra
- **WHEN** uma chave de playoff de acesso, playout ou barragem é decidida
- **THEN** nenhum confete de título dispara (`celebrarCampeao=false`)

#### Scenario: Não repete a cada navegação
- **WHEN** o usuário volta à página do campeão já decidido depois de já ter visto a celebração
- **THEN** o confete não dispara de novo

### Requirement: Opt-out por movimento reduzido

A celebração SHALL respeitar `prefers-reduced-motion: reduce`: nesse caso NÃO SHALL
animar o confete (a checagem via `matchMedia` impede até a montagem do confete),
mantendo o destaque estático do campeão, sem introduzir layout novo.

#### Scenario: Usuário com movimento reduzido
- **WHEN** o usuário tem `prefers-reduced-motion: reduce`
- **THEN** o destaque do campeão aparece sem o burst de confete animado

### Requirement: Compartilhar o pôster de temporada (wire do órfão)

A seção "fim de temporada" da liga SHALL oferecer ao DONO um botão "Compartilhar
temporada" que consome a rota de imagem de temporada já existente
(`.../temporada/[seasonId]/imagem`, dono-only, inalterada) via `compartilharWhatsApp`,
com texto montado no servidor (`mensagemTemporada`). O gating do pôster de temporada
SHALL permanecer dono-only (diferente dos cards de resultado/classificação).

#### Scenario: Dono compartilha o pôster da temporada encerrada
- **WHEN** o dono da liga, na seção de fim de temporada, toca "Compartilhar temporada"
- **THEN** o pôster PNG (campeão + promovidos/rebaixados) é gerado e compartilhado

#### Scenario: Não-dono não vê o botão
- **WHEN** um usuário que não é dono da liga acessa a área de temporada
- **THEN** o botão "Compartilhar temporada" não aparece (o pôster segue dono-only)

