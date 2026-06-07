# club-slots Specification

## Purpose
TBD - created by archiving change add-club-tournaments. Update Purpose after archive.
## Requirements
### Requirement: Vaga de clube no torneio
Torneios de formatos competitivos (liga, mata-mata, grupos, fase de liga) SHALL ser compostos por VAGAS (`tournament_slots`): cada vaga referencia um CLUBE (obrigatório, único por torneio) e um TÉCNICO anulável (usuário atual). A disputa (partidas, classificação, chave) SHALL referenciar VAGAS — trocar o técnico NÃO SHALL alterar nenhuma partida. Um usuário SHALL comandar no máximo uma vaga por torneio. Apagar a conta do técnico SHALL apenas esvaziar a vaga (o torneio sobrevive).

#### Scenario: Torneio nasce com os clubes
- **WHEN** o dono cria um torneio competitivo informando os clubes
- **THEN** cada clube vira uma vaga (sem técnico) e o torneio está pronto para receber técnicos por convite

#### Scenario: Troca de técnico preserva o histórico
- **WHEN** o técnico de um clube é substituído no meio do torneio
- **THEN** partidas, classificação e chave do clube permanecem intactas — o novo técnico herda tudo

#### Scenario: Um clube por pessoa
- **WHEN** um usuário que já comanda um clube tenta assumir outro no mesmo torneio
- **THEN** o aceite é recusado com mensagem clara

### Requirement: Convite por vaga
Cada vaga SHALL ter um código de convite PRÓPRIO (segredo do dono, em tabela 1:1 separada, regenerável — regenerar invalida o anterior). Quem abre o link logado SHALL poder assumir AQUELA vaga se estiver VAZIA; o aceite SHALL ser um UPDATE atômico filtrado por vaga vazia (corrida entre dois aceites tem exatamente um vencedor; o perdedor recebe orientação). O convite SHALL valer com o torneio em rascunho OU ativo (substituição no meio do torneio); torneio encerrado SHALL recusar. O dono SHALL poder assumir uma vaga vazia para si pelo mesmo caminho de aceite.

#### Scenario: Assumir clube pelo link
- **WHEN** um usuário logado abre o link de uma vaga vazia de torneio não encerrado
- **THEN** vê o clube e o torneio, confirma, e passa a ser o técnico daquele clube

#### Scenario: Vaga ocupada
- **WHEN** o link é de uma vaga que já tem técnico
- **THEN** o aceite é recusado informando que o clube já tem técnico

#### Scenario: Corrida de dois aceites
- **WHEN** duas pessoas confirmam o mesmo convite quase simultaneamente
- **THEN** exatamente uma assume; a outra recebe que a vaga acabou de ser ocupada

### Requirement: Desistência e expulsão a qualquer momento
O TÉCNICO SHALL poder desistir (esvaziar a própria vaga) e o DONO SHALL poder expulsar (esvaziar qualquer vaga) em torneio rascunho OU ativo — sem congelamento; torneio encerrado SHALL travar ambos. Esvaziar SHALL ser a única operação de escrita de técnico fora do aceite: ninguém SHALL atribuir um terceiro a uma vaga (consentimento só por convite). O clube órfão SHALL permanecer na disputa com suas partidas geridas pelo dono.

#### Scenario: Desistência no meio do torneio
- **WHEN** um técnico desiste com o torneio ativo
- **THEN** a vaga fica órfã, as partidas do clube permanecem, e um novo convite pode trazer o substituto

#### Scenario: Expulsão pelo adm
- **WHEN** o dono expulsa o técnico de um clube
- **THEN** a vaga fica órfã do mesmo jeito (mesmo efeito da desistência)

#### Scenario: Dono não atribui terceiro
- **WHEN** qualquer escrita tenta colocar OUTRO usuário direto na vaga (sem aceite)
- **THEN** a operação é negada (policy WITH CHECK só aceita esvaziar)

### Requirement: Vagas imutáveis fora do rascunho
Adicionar/remover vagas e trocar o CLUBE de uma vaga SHALL ser permitido apenas em RASCUNHO, pelo dono. Após a geração da disputa, a geometria (vagas e clubes) SHALL ser imutável — banco SHALL travar `team_id`/`tournament_id` da vaga via trigger além das policies.

#### Scenario: Clubes editáveis no rascunho
- **WHEN** o torneio está em rascunho
- **THEN** o dono adiciona/remove clubes e os convites correspondentes nascem/morrem juntos

#### Scenario: Geometria congelada após iniciar
- **WHEN** o torneio está ativo
- **THEN** trocar o clube de uma vaga ou remover uma vaga é negado em todas as camadas

### Requirement: Display por clube com técnico como detalhe
Em formatos competitivos, todo lado de partida/classificação/chave SHALL ser exibido como o CLUBE (escudo + nome), com o técnico atual como detalhe ("téc. {nome}" ou indicação de clube sem técnico). A convocação via WhatsApp SHALL usar o celular do TÉCNICO da vaga adversária, mantendo o gate de participante.

#### Scenario: Classificação de clubes
- **WHEN** a página do torneio competitivo renderiza a classificação
- **THEN** cada linha mostra escudo + nome do clube e o técnico atual como detalhe

#### Scenario: Clube órfão visível
- **WHEN** uma vaga está sem técnico
- **THEN** o clube aparece normalmente com a indicação de vaga aberta

