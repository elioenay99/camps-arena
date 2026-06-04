## ADDED Requirements

### Requirement: Criação de partida via Server Action
O sistema SHALL expor uma Server Action `createMatch` que cria uma partida em um torneio do próprio usuário. A action SHALL exigir sessão válida (`auth.getUser()`), validar a entrada com Zod e conferir no servidor que o torneio pertence ao usuário e não está `encerrado` antes de inserir. O INSERT SHALL enviar somente `tournament_id`, `participante_1` e `participante_2` (status e placares ficam com os defaults do banco).

#### Scenario: Criação com sucesso redireciona ao dashboard
- **WHEN** o dono de um torneio não encerrado submete o form com torneio válido
- **THEN** a partida é inserida e o usuário é redirecionado para `/dashboard`

#### Scenario: Sem sessão é rejeitado sem tocar o banco
- **WHEN** a action é invocada sem usuário autenticado
- **THEN** retorna erro e nenhum INSERT é executado

#### Scenario: Torneio de terceiro ou encerrado é rejeitado
- **WHEN** o `tournamentId` não pertence ao usuário, não existe ou está `encerrado`
- **THEN** a action retorna erro único (sem revelar a existência de torneios alheios) e não insere

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
O sistema SHALL oferecer a página protegida `/dashboard/partidas/nova` com um formulário que lista somente os torneios do próprio usuário não encerrados e os usuários disponíveis como participantes. Sem torneio próprio elegível, a página SHALL orientar a criação de um torneio primeiro.

#### Scenario: Form lista apenas torneios do usuário
- **WHEN** o usuário autenticado abre `/dashboard/partidas/nova`
- **THEN** o select de torneio contém apenas torneios criados por ele e não encerrados

#### Scenario: Sem torneio próprio
- **WHEN** o usuário não possui torneio elegível
- **THEN** a página exibe orientação com link para `/dashboard/torneios/novo` em vez do form
