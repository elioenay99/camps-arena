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

### Requirement: Texto da lista de times para o WhatsApp

O sistema SHALL prover, em `src/lib/whatsapp.ts` (fonte única), uma função
`mensagemListaTimes` que monta o texto de uma **lista dos times** de um torneio competitivo
para o WhatsApp, a partir das vagas já resolvidas. O texto SHALL conter um cabeçalho com o
título do campeonato seguido de "Times", **uma linha por time** e SHALL terminar com a URL
absoluta da página do campeonato (`NEXT_PUBLIC_SITE_URL`). Em cada linha: quando o time tem
técnico com celular, o nome do técnico **e o link `wa.me`** dele; quando tem técnico sem
celular, **apenas o nome** (sem link e sem ❌); quando não tem técnico (vaga órfã ou
competidor por nome), a marca **❌**. O `wa.me` SHALL derivar de `linkWhatsApp` (o celular
entra embutido no link, nunca cru) e o texto SHALL ser montado no SERVIDOR. O texto SHALL ser
sem emoji decorativo (o ❌ é caractere unicode estável e desejado) e ter fallback para título
ausente.

#### Scenario: Time com técnico e celular

- **WHEN** um time tem técnico com celular cadastrado
- **THEN** a linha desse time traz o nome do clube, o nome do técnico e o link `wa.me` dele

#### Scenario: Time com técnico sem celular

- **WHEN** um time tem técnico mas o técnico não cadastrou celular
- **THEN** a linha traz o clube e o nome do técnico, sem link `wa.me` e sem ❌

#### Scenario: Time sem técnico recebe ❌

- **WHEN** um time está sem técnico (vaga órfã) ou é um competidor por nome
- **THEN** a linha marca esse time com ❌

#### Scenario: Texto termina com o link do campeonato

- **WHEN** o texto da lista é montado
- **THEN** ele começa com "&lt;título&gt; — Times", traz uma linha por time e termina com a
  URL absoluta da página do campeonato, sem emoji decorativo

### Requirement: Compartilhar a lista de times no WhatsApp

Quem **modera** um torneio competitivo (dono, admin ou moderador) SHALL poder COMPARTILHAR a
lista de times no WhatsApp por um controle dedicado (componente client) no cabeçalho da lista
de vagas, que entrega **apenas o texto** (sem imagem). No celular, o controle SHALL usar a
Web Share API (`navigator.share({ text, title })`); o cancelamento do usuário (`AbortError`)
NÃO SHALL ser tratado como erro. No desktop (ou onde a Web Share não é suportada), o controle
SHALL cair em um fallback: copiar o texto (área de transferência) e abrir
`https://wa.me/?text=` com o texto. O celular dos técnicos SHALL ser resolvido no servidor
pela RPC gated `celulares_de_contato` (embutido no `wa.me`, nunca cru no client); técnicos de
quem o usuário não é co-participante SHALL aparecer sem link (degradação graciosa). O controle
SHALL aparecer somente em torneio competitivo com vagas e somente para quem modera (não no
avulso, não para quem só visualiza).

#### Scenario: Compartilhar no celular em um toque

- **WHEN** quem modera toca "Compartilhar" num aparelho com Web Share
- **THEN** abre a folha de compartilhamento com o texto da lista de times, pronta para o
  grupo do WhatsApp

#### Scenario: Fallback no desktop

- **WHEN** quem modera clica "Compartilhar" num navegador sem Web Share
- **THEN** o texto é copiado e o `wa.me` abre com o texto pré-preenchido

#### Scenario: Cancelar não é erro

- **WHEN** o usuário fecha a folha de compartilhamento sem enviar
- **THEN** nenhum toast de erro aparece (o `AbortError` é ignorado)

#### Scenario: Só quem modera, só competitivo com vagas

- **WHEN** um visitante vê o torneio, ou o torneio é avulso, ou não há vagas
- **THEN** o controle de compartilhar a lista não aparece

