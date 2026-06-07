# row-level-security — Delta Spec

## ADDED Requirements

### Requirement: Políticas de tournament_slots
RLS SHALL garantir: SELECT para quem vê o torneio; INSERT/DELETE apenas pelo dono e apenas com o torneio em rascunho; UPDATE em dois caminhos — dono (esvaziar técnico a qualquer momento não-encerrado; editar clube só em rascunho) e o PRÓPRIO técnico (esvaziar a própria vaga). WITH CHECK SHALL impedir atribuir user_id não-nulo via UPDATE direto (atribuição só pelo RPC de aceite). Um trigger SHALL travar team_id/tournament_id fora do rascunho.

#### Scenario: Técnico só esvazia a si
- **WHEN** um técnico tenta por POST direto se trocar por outro usuário
- **THEN** o WITH CHECK recusa (só user_id nulo passa)

#### Scenario: Vagas nascem só no rascunho
- **WHEN** o dono tenta inserir vaga com o torneio ativo
- **THEN** a policy recusa

### Requirement: Políticas de slot_invites e RPCs de vaga
`slot_invites` SHALL ser legível/gravável apenas pelo dono do torneio. `aceitar_convite_vaga(codigo)` e `info_convite_vaga(codigo)` SHALL ser SECURITY DEFINER para authenticated: o aceite valida sessão, torneio não-encerrado e vaga vazia com UPDATE atômico filtrado; o unique parcial barra segundo clube do mesmo usuário.

#### Scenario: Código não vaza
- **WHEN** um não-dono consulta slot_invites
- **THEN** nenhuma linha retorna

#### Scenario: Aceite atômico
- **WHEN** dois usuários aceitam o mesmo convite simultaneamente
- **THEN** o UPDATE filtrado por user_id nulo garante exatamente um vencedor

## MODIFIED Requirements

### Requirement: Escrita restrita ao dono da partida
Partidas AVULSAS: o participante (participante_1/2 = auth.uid()) ou o dono do torneio SHALL poder atualizar placar/clube como hoje. Partidas COMPETITIVAS: SHALL poder atualizar quem for TÉCNICO de uma das vagas da partida (EXISTS em tournament_slots com user_id = auth.uid()) ou o dono do torneio. Status segue restrito ao dono (trigger). Vaga órfã: só o dono movimenta a partida.

#### Scenario: Técnico lança placar
- **WHEN** o técnico atual de um dos clubes da partida atualiza o placar
- **THEN** a escrita passa (RLS + trigger de lifecycle)

#### Scenario: Ex-técnico não escreve
- **WHEN** quem desistiu/foi expulso tenta atualizar partida do antigo clube
- **THEN** a escrita é negada (não é mais técnico da vaga)

### Requirement: Criação de partida restrita ao dono do torneio
INSERT em matches SHALL exigir dono do torneio + não-encerrado. Partidas geradas (rodada não nula) SHALL ter cada VAGA informada pertencente ao torneio (EXISTS em tournament_slots). Avulso mantém a validação por participants.

#### Scenario: Vaga estrangeira recusada
- **WHEN** um INSERT informa vaga_1 de OUTRO torneio
- **THEN** a policy recusa

### Requirement: Políticas de participants
As políticas de participants SHALL valer para o formato AVULSO: SELECT por quem vê o torneio; INSERT dono-para-si; DELETE pelo próprio ou pelo dono SEM cláusula de congelamento por formato (formatos competitivos não usam participants).

#### Scenario: Sair de torneio avulso é livre
- **WHEN** um participante sai de torneio avulso a qualquer momento
- **THEN** o DELETE passa (sem congelamento)

### Requirement: Funções SECURITY DEFINER de convite
`aceitar_convite`/`info_convite` (genéricos) SHALL atender apenas o formato avulso. `eh_participante(t_id)` SHALL considerar participants OU vaga comandada no torneio (técnicos veem torneio privado).

#### Scenario: Técnico vê torneio privado
- **WHEN** um técnico de vaga consulta um torneio privado em que comanda clube
- **THEN** a visibilidade é concedida via eh_participante
