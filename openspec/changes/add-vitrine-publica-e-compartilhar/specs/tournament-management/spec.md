## ADDED Requirements

### Requirement: Listar o torneio na vitrine pública (opt-in)

A página do torneio SHALL oferecer, na área de gestão, um toggle "Listar na
vitrine pública" que alterna a coluna `tournaments.listada`. O toggle SHALL ser
renderizado SOMENTE quando o usuário tem capacidade GERIR (`podeGerir`) E o
torneio NÃO é uma divisão de pirâmide (`liga_do_torneio` retorna null) — uma
divisão se publica pela liga-mãe, nunca sozinha. A persistência SHALL ocorrer via
Server Action que valida a entrada, checa `podeGerir` pela `tournamentId`,
REJEITA torneios de divisão, e atualiza a própria linha (`update tournaments set
listada = ... where id = tournamentId`), confiando na RLS de update do dono
existente (sem policy nova). A coluna SHALL ter default `false` (opt-in real).

#### Scenario: Gestor de torneio de topo publica na vitrine

- **WHEN** o dono (ou admin) de um torneio de topo aciona o toggle "Listar na
  vitrine pública"
- **THEN** `tournaments.listada` passa a `true` e o torneio passa a poder aparecer
  na vitrine (respeitados `is_public` e a exclusão de divisões)

#### Scenario: Toggle ausente em divisão de pirâmide

- **WHEN** um gestor abre a página de um torneio que é DIVISÃO de uma pirâmide
- **THEN** o toggle "Listar na vitrine pública" NÃO é renderizado (e a action
  rejeita a chamada, caso forçada)

#### Scenario: Toggle ausente para não-gestor

- **WHEN** um usuário sem capacidade GERIR abre a página do torneio
- **THEN** o toggle não é renderizado e a Server Action rejeita a alteração de
  `listada`

### Requirement: Compartilhar o torneio

A página do torneio SHALL oferecer um botão "Compartilhar" visível SOMENTE ao
gestor (`podeGerir`), que compartilha o link canônico da página do torneio
(`/dashboard/torneios/[id]`) pelo padrão existente (Web Share API no celular,
copiar para a área de transferência no desktop). O botão SHALL reutilizar a
orquestração de compartilhamento já usada por `CompartilharRodadaButton` (sem
imagem — apenas o link).

#### Scenario: Gestor compartilha o link do torneio

- **WHEN** o gestor aciona "Compartilhar" na página do torneio
- **THEN** o app dispara o Web Share (celular) ou copia o link canônico do torneio
  (desktop)

#### Scenario: Botão ausente para não-gestor

- **WHEN** um usuário sem capacidade GERIR abre a página do torneio
- **THEN** o botão "Compartilhar" não é renderizado
