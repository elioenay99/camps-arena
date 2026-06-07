# tournament-participants — Delta Spec

## MODIFIED Requirements

### Requirement: Convite por link com código secreto
O convite GENÉRICO de torneio (código único por torneio) SHALL existir apenas para o formato AVULSO. Formatos competitivos usam convite POR VAGA (capability club-slots). A página `/convite/[codigo]` SHALL atender os dois: tenta o convite de vaga e faz fallback ao genérico.

#### Scenario: Código de vaga na rota única
- **WHEN** alguém abre /convite/{code} de uma vaga
- **THEN** a página resolve via info_convite_vaga e oferece assumir o clube

#### Scenario: Código genérico de avulso
- **WHEN** o code é de tournament_invites (avulso)
- **THEN** o fluxo atual de aceite é oferecido

### Requirement: Sair e remover
Sair/remover via participants SHALL valer apenas para o formato AVULSO, sem congelamento (avulso não tem disputa gerada). Em formatos competitivos, sair = DESISTIR da vaga e remover = EXPULSAR técnico (capability club-slots), ambos livres até o encerramento.

#### Scenario: Avulso sem congelamento
- **WHEN** um participante de avulso sai
- **THEN** o DELETE passa em qualquer status não-encerrado

### Requirement: Lista de participantes na página do torneio
Em torneios AVULSOS a lista de participantes permanece. Em torneios COMPETITIVOS a página SHALL exibir a lista de VAGAS: clube (escudo+nome), técnico atual ou "vaga aberta", e — para o dono — o convite da vaga (copiar/regenerar) e a ação de expulsar; para o técnico, a ação de desistir.

#### Scenario: Painel de vagas do dono
- **WHEN** o dono abre seu torneio competitivo
- **THEN** vê cada clube com técnico/vaga aberta, link de convite por clube e ações
