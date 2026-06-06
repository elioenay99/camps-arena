# match-creation Specification

## Purpose
TBD - created by archiving change add-match-creation. Update Purpose after archive.
## Requirements
### Requirement: Criação de partida via Server Action
O sistema SHALL expor uma Server Action `createMatch` que cria uma partida em um torneio do próprio usuário. A action SHALL exigir sessão válida (`auth.getUser()`), validar a entrada com Zod e conferir no servidor que o torneio pertence ao usuário, não está `encerrado` E tem `formato = 'avulso'` antes de inserir — qualquer formato GERADO (`liga`, `mata_mata`) SHALL ser rejeitado com mensagem clara (as partidas desses formatos nascem exclusivamente da geração de tabela/chave). Cada participante informado SHALL estar na lista de participantes (`participants`) do torneio — caso contrário a action rejeita com erro claro. O INSERT SHALL enviar somente `tournament_id`, `participante_1` e `participante_2` (status e placares ficam com os defaults do banco).

#### Scenario: Criação com sucesso redireciona à página do torneio
- **WHEN** o dono de um torneio avulso não encerrado submete o form com participantes do torneio (ou a definir)
- **THEN** a partida é inserida e o usuário é redirecionado para `/dashboard/torneios/[id]`

#### Scenario: Sem sessão é rejeitado sem tocar o banco
- **WHEN** a action é invocada sem usuário autenticado
- **THEN** retorna erro e nenhum INSERT é executado

#### Scenario: Torneio de terceiro ou encerrado é rejeitado
- **WHEN** o `tournamentId` não pertence ao usuário, não existe ou está `encerrado`
- **THEN** a action retorna erro único (sem revelar a existência de torneios alheios) e não insere

#### Scenario: Formato gerado é rejeitado
- **WHEN** o `tournamentId` referencia um torneio do usuário com `formato` diferente de `avulso` (liga ou mata-mata)
- **THEN** a action retorna erro claro explicando que as partidas desse formato vêm da geração, e não insere

#### Scenario: Participante fora da lista é rejeitado
- **WHEN** o form é submetido com um usuário que não é participante do torneio
- **THEN** a action retorna erro e nenhum INSERT é executado

#### Scenario: Erro do banco vira mensagem genérica
- **WHEN** o INSERT falha (RLS, indisponibilidade)
- **THEN** a action retorna mensagem genérica sem vazar detalhes internos

### Requirement: Participantes opcionais e distintos
A partida MAY ser criada sem participantes definidos (lados a definir). Quando ambos os participantes forem informados, eles SHALL ser distintos (espelha a CHECK `matches_participantes_distintos` do banco).

#### Scenario: Partida sem participantes
- **WHEN** o form é submetido sem selecionar participantes
- **THEN** a partida é criada com `participante_1` e `participante_2` nulos

#### Scenario: Mesmo participante nos dois lados é rejeitado
- **WHEN** o mesmo usuário é selecionado como participante 1 e 2
- **THEN** a validação rejeita antes de tocar o banco

### Requirement: Formulário de nova partida
O sistema SHALL oferecer o formulário de nova partida na página protegida
`/dashboard/torneios/[id]/partidas/nova`, acessível apenas ao dono de torneio
AVULSO não encerrado (demais casos — incluindo torneios liga e mata-mata —
respondem 404 único). Os selects de participante SHALL listar somente os
participantes do torneio (além de "Definir depois") e a página do torneio
SHALL oferecer ao dono o atalho "Nova partida" apenas em torneio avulso. A
rota `/dashboard/partidas/nova` SHALL atuar como seletor: lista os torneios
AVULSOS do próprio usuário não encerrados e encaminha ao formulário do
torneio escolhido; sem torneio elegível, SHALL orientar a criação de um
torneio primeiro.

#### Scenario: Form lista apenas participantes do torneio
- **WHEN** o dono abre `/dashboard/torneios/[id]/partidas/nova` de torneio avulso
- **THEN** os selects de participante contêm somente os participantes confirmados daquele torneio

#### Scenario: Não-dono não acessa o form
- **WHEN** um usuário que não é o dono (ou o torneio está encerrado/inexistente) abre a rota do form
- **THEN** a resposta é 404 sem distinguir os casos

#### Scenario: Formato gerado não tem form de partida manual
- **WHEN** o dono de uma liga ou de um mata-mata abre a rota do form deles
- **THEN** a resposta é 404, igual aos demais casos não elegíveis

#### Scenario: Seletor encaminha ao torneio
- **WHEN** o usuário abre `/dashboard/partidas/nova` e escolhe um dos seus torneios avulsos
- **THEN** ele é levado a `/dashboard/torneios/[id]/partidas/nova`

#### Scenario: Seletor não lista formatos gerados
- **WHEN** o usuário possui apenas torneios de formato liga ou mata-mata
- **THEN** o seletor não os lista e exibe a orientação de criar um torneio avulso

#### Scenario: Sem torneio próprio
- **WHEN** o usuário não possui torneio elegível
- **THEN** a página exibe orientação com link para `/dashboard/torneios/novo` em vez do seletor

