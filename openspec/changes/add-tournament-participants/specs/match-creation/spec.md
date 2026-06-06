# match-creation — delta

## MODIFIED Requirements

### Requirement: Criação de partida via Server Action
O sistema SHALL expor uma Server Action `createMatch` que cria uma partida em um torneio do próprio usuário. A action SHALL exigir sessão válida (`auth.getUser()`), validar a entrada com Zod e conferir no servidor que o torneio pertence ao usuário e não está `encerrado` antes de inserir. Cada participante informado SHALL estar na lista de participantes (`participants`) do torneio — caso contrário a action rejeita com erro claro. O INSERT SHALL enviar somente `tournament_id`, `participante_1` e `participante_2` (status e placares ficam com os defaults do banco).

#### Scenario: Criação com sucesso redireciona à página do torneio
- **WHEN** o dono de um torneio não encerrado submete o form com participantes do torneio (ou a definir)
- **THEN** a partida é inserida e o usuário é redirecionado para `/dashboard/torneios/[id]`

#### Scenario: Sem sessão é rejeitado sem tocar o banco
- **WHEN** a action é invocada sem usuário autenticado
- **THEN** retorna erro e nenhum INSERT é executado

#### Scenario: Torneio de terceiro ou encerrado é rejeitado
- **WHEN** o `tournamentId` não pertence ao usuário, não existe ou está `encerrado`
- **THEN** a action retorna erro único (sem revelar a existência de torneios alheios) e não insere

#### Scenario: Participante fora da lista é rejeitado
- **WHEN** o form é submetido com um usuário que não é participante do torneio
- **THEN** a action retorna erro e nenhum INSERT é executado

#### Scenario: Erro do banco vira mensagem genérica
- **WHEN** o INSERT falha (RLS, indisponibilidade)
- **THEN** a action retorna mensagem genérica sem vazar detalhes internos

### Requirement: Formulário de nova partida
O sistema SHALL oferecer o formulário de nova partida na página protegida
`/dashboard/torneios/[id]/partidas/nova`, acessível apenas ao dono de torneio
não encerrado (demais casos respondem 404 único). Os selects de participante
SHALL listar somente os participantes do torneio (além de "Definir depois") e
a página do torneio SHALL oferecer ao dono o atalho "Nova partida". A rota
`/dashboard/partidas/nova` SHALL atuar como seletor: lista os torneios do
próprio usuário não encerrados e encaminha ao formulário do torneio escolhido;
sem torneio elegível, SHALL orientar a criação de um torneio primeiro.

#### Scenario: Form lista apenas participantes do torneio
- **WHEN** o dono abre `/dashboard/torneios/[id]/partidas/nova`
- **THEN** os selects de participante contêm somente os participantes confirmados daquele torneio

#### Scenario: Não-dono não acessa o form
- **WHEN** um usuário que não é o dono (ou o torneio está encerrado/inexistente) abre a rota do form
- **THEN** a resposta é 404 sem distinguir os casos

#### Scenario: Seletor encaminha ao torneio
- **WHEN** o usuário abre `/dashboard/partidas/nova` e escolhe um dos seus torneios
- **THEN** ele é levado a `/dashboard/torneios/[id]/partidas/nova`

#### Scenario: Sem torneio próprio
- **WHEN** o usuário não possui torneio elegível
- **THEN** a página exibe orientação com link para `/dashboard/torneios/novo` em vez do seletor
