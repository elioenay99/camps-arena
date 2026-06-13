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

### Requirement: Vaga competitiva por nome (sem clube)

Uma vaga de torneio competitivo SHALL poder representar um competidor por NOME livre
(rótulo de texto) em vez de um clube real, governado por um toggle por torneio (todo
o torneio é de clubes OU de nomes, nunca misto). A vaga por nome NÃO SHALL ter clube,
técnico, dono nem convite de vaga: o organizador lança todos os placares. Os nomes
SHALL ser únicos por torneio (case-insensitive) e imutáveis após o início. A exibição
SHALL usar o nome com avatar de iniciais (sem escudo), e os motores de geração e a
autorização de placar permanecem inalterados (a vaga é um id opaco).

#### Scenario: Criar torneio por nome

- **WHEN** o dono cria um torneio competitivo com o modo "por nome" e digita os nomes
- **THEN** cada nome vira uma vaga sem clube e sem convite, e o torneio gera tabela/
  chave normalmente disputada por essas vagas

#### Scenario: Exibição da vaga por nome

- **WHEN** uma vaga por nome aparece na classificação, chave, partidas ou na lista de
  vagas
- **THEN** mostra o nome com avatar de iniciais, sem escudo, sem técnico e sem console
  de convite

#### Scenario: Lançamento de placar por nome

- **WHEN** o dono lança o placar de uma partida de um torneio por nome
- **THEN** o placar é registrado normalmente (o dono é a autoridade; não há técnico a
  convocar), e o W.O. automático não toca partidas sem técnico em ambos os lados

### Requirement: Vaga por nome não tem convite

Vaga por NOME (sem clube — `team_id` nulo) NÃO SHALL ter convite de vaga
(`slot_invites`): o organizador lança os placares, não há técnico a convidar. A
criação ou regeneração de convite para uma vaga por-nome SHALL ser barrada em
PROFUNDIDADE — pela Server Action (recusa com mensagem clara ao dono, antes de
tocar o banco), pela RLS (`with check` exclui `team_id` nulo) e por um trigger de
integridade (BEFORE INSERT/UPDATE, universal — vale inclusive para
`service_role`). A trava NÃO SHALL afetar vagas de CLUBE: o convite por vaga de
clube continua sendo gerado, regenerado e aceito como antes.

#### Scenario: Convite para vaga por nome é barrado

- **WHEN** o dono tenta gerar/regenerar o convite de uma vaga por nome (por POST
  direto à ação; a UI não expõe o botão nesse caso)
- **THEN** a operação é recusada com mensagem clara e nenhum `slot_invite` é
  criado para a vaga por nome

#### Scenario: Vaga de clube segue com convite

- **WHEN** o dono regenera o convite de uma vaga de clube
- **THEN** o convite é (re)gerado normalmente e pode ser aceito

#### Scenario: Bypass direto também é barrado no banco

- **WHEN** uma escrita em `slot_invites` aponta para uma vaga por nome por um
  caminho que contorna a Server Action
- **THEN** a RLS e o trigger de integridade impedem a escrita

