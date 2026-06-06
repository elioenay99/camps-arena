# tournament-index — delta

## ADDED Requirements

### Requirement: Página índice de torneios
O sistema SHALL oferecer a página protegida `/dashboard/torneios` listando os
torneios que o usuário organiza (criados por ele) e os torneios dos quais
participa sem ser o dono, cada item com link para a página do torneio. Sem
nenhum torneio, a página SHALL orientar a criação (link para
`/dashboard/torneios/novo`).

#### Scenario: Listas Organizo e Participo
- **WHEN** um usuário autenticado que organiza torneios e participa de outros abre `/dashboard/torneios`
- **THEN** vê os dois grupos, sem duplicar torneio próprio em "Participo"

#### Scenario: Participante encontra torneio privado de terceiro
- **WHEN** um usuário que aceitou convite de torneio privado abre o índice
- **THEN** o torneio aparece em "Participo" com link funcional

#### Scenario: Estado vazio
- **WHEN** o usuário não organiza nem participa de torneio algum
- **THEN** a página orienta criar um torneio

### Requirement: Entrada de navegação
O shell autenticado SHALL incluir o link "Torneios" para `/dashboard/torneios`
na navegação persistente, com estado ativo por prefixo de rota.

#### Scenario: Link no nav
- **WHEN** o usuário está em qualquer página autenticada
- **THEN** o nav exibe "Torneios" e o marca ativo nas rotas `/dashboard/torneios*`
