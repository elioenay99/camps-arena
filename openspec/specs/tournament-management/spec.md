# tournament-management Specification

## Purpose
TBD - created by archiving change add-tournament-ownership. Update Purpose after archive.
## Requirements
### Requirement: Criação de torneio com dono
A criação SHALL registrar created_by e visibilidade como hoje. Para formatos COMPETITIVOS, o formulário SHALL incluir a montagem dos CLUBES (mínimo 2; máximo do formato): busca de clube (API-Football/cache teams) e lista das vagas; a action SHALL criar torneio + vagas + convites por vaga (códigos únicos com retry de colisão), SEM entrada automática do dono e SEM convite genérico. Para o formato AVULSO, o fluxo atual permanece (participants + convite genérico + entrada do dono).

#### Scenario: Competitivo nasce com vagas e convites
- **WHEN** o dono cria uma liga com 4 clubes
- **THEN** nascem 4 vagas (sem técnicos) cada uma com seu link de convite

#### Scenario: Avulso preserva o fluxo antigo
- **WHEN** o dono cria um torneio avulso
- **THEN** ele entra como participante e o convite genérico é gerado como hoje

### Requirement: Formulário de criação adaptativo

O formulário de criação de torneio SHALL apresentar o FORMATO como cards
selecionáveis (ícone + nome + descrição curta), e SHALL revelar progressivamente
apenas os campos relevantes ao formato escolhido: o passo de Clubes e as opções
(ida e volta, 3º lugar) só nos formatos competitivos/com chave, e os "Pontos por
resultado" SOMENTE em formatos com tabela (liga, grupos + mata-mata, fase de
liga). O formato avulso SHALL exigir o mínimo (título, formato, visibilidade). A
apresentação SHALL preservar o contrato de submissão atual (a action
`createTournament` recebe os mesmos campos; campos não exibidos assumem os
defaults do schema).

#### Scenario: Avulso mostra o mínimo

- **WHEN** o criador seleciona o formato avulso
- **THEN** o formulário exibe só título, seletor de formato e visibilidade — sem
  clubes nem pontos por resultado

#### Scenario: Pontos só onde há tabela

- **WHEN** o criador seleciona mata-mata
- **THEN** aparecem clubes, ida e volta e 3º lugar, mas NÃO "Pontos por resultado"
  (que surge em liga, grupos + mata-mata e fase de liga)

#### Scenario: Formato em cards seleciona o valor

- **WHEN** o criador clica no card de um formato
- **THEN** o card fica destacado e o valor é submetido como `formato` (radio),
  preservando a semântica de grupo e o foco por teclado

### Requirement: Apresentação da página do torneio

A página do torneio SHALL exibir um cabeçalho com o ícone do formato, o título e
metadados escaneáveis (status, formato, e — onde há classificação por pontos — a
pontuação V/E/D), em vez de uma linha de texto corrida. As seções (chave,
classificação, grupos, partidas, W.O., encerradas, clubes) SHALL ter títulos com
ícone consistentes, e os estados vazios SHALL ser apresentados de forma uniforme
(ícone + texto). A apresentação NÃO SHALL alterar quais seções aparecem nem os
dados/comportamento (queries, RLS, ações permanecem como hoje).

#### Scenario: Cabeçalho com formato e status

- **WHEN** um torneio é aberto
- **THEN** o cabeçalho mostra o ícone do formato, o título e o status (e a
  pontuação V/E/D apenas em formatos com tabela)

#### Scenario: Seções com estado vazio uniforme

- **WHEN** uma seção (ex.: classificação) ainda não tem conteúdo
- **THEN** ela exibe um estado vazio padronizado (ícone + texto), sem alterar
  quando a seção aparece

### Requirement: Apresentação dos painéis de início do torneio

Os painéis "Iniciar torneio" dos formatos gerados SHALL ser apresentados numa
moldura de card consistente com a criação e o cabeçalho do torneio: ícone do
formato, título em destaque, indicação de rascunho e a prévia da geração realçada.
As opções de chaveamento/distribuição
(sorteio, sorteio com potes, montagem manual) SHALL ser apresentadas como cartões
selecionáveis (ícone + descrição), e as configurações adicionais reveladas
(cabeças de chave, grupo por clube, confrontos) SHALL aparecer com transição suave
e alvos de toque adequados ao uso em celular. A apresentação NÃO SHALL alterar a
prévia (mesmo motor da geração), os nomes dos campos enviados às actions, os gates
de quantidade/configuração nem os papéis acessíveis (`status`/`alert`, rótulos dos
controles).

#### Scenario: Painel de início com moldura e prévia realçada

- **WHEN** o dono abre um torneio de formato gerado em rascunho
- **THEN** o painel mostra o ícone do formato, o título "Iniciar torneio", a
  indicação de rascunho e a prévia do que será gerado em destaque

#### Scenario: Modos de chaveamento como cartões selecionáveis

- **WHEN** um painel oferece mais de um modo (sorteio, potes, manual)
- **THEN** cada modo aparece como um cartão selecionável com ícone e descrição, e
  selecionar um modo revela suas configurações com transição suave

#### Scenario: Apresentação não altera comportamento

- **WHEN** qualquer painel de início é renderizado (prévia, gates, disclosure)
- **THEN** a prévia, os nomes de campo enviados à action, os gates e os papéis
  acessíveis permanecem como antes, apenas com a nova moldura e os cartões

### Requirement: Página de detalhe do torneio organizada em abas

A página de detalhe do torneio (`/dashboard/torneios/[id]`) SHALL organizar suas seções em ABAS,
em vez de empilhá-las num scroll único, agrupadas por assunto: **Classificação**, **Partidas**,
**Rodadas** e **Vagas** (ou **Participantes** no avulso). As abas SHALL ser DINÂMICAS — uma aba só
aparece quando há conteúdo que o usuário pode ver. A aba **Classificação** SHALL ser o padrão. O
**cabeçalho** (nome, status, identidade/cores, "Nova partida") e a **Administração** do torneio
(equipe, encerrar, reabrir) SHALL permanecer FORA das abas, fixos no topo. O carregamento de
dados e TODOS os gates por papel (gerir/arbitrar/moderar) e por formato SHALL permanecer no
Server Component da página; a troca de aba SHALL ser client-side, sem recarregar a página nem
refazer as consultas, e SHALL preservar a contenção de PII (nada de celular cru cruzando a
fronteira servidor→cliente).

#### Scenario: Abas dinâmicas conforme conteúdo e papel

- **WHEN** um torneio de liga ativo é aberto pelo organizador
- **THEN** aparecem as abas Classificação (padrão), Partidas, Rodadas e Vagas

#### Scenario: Aba sem conteúdo é omitida

- **WHEN** o espectador não-organizador não tem cadência de rodadas a liberar
- **THEN** a aba "Rodadas" não é exibida

#### Scenario: Cabeçalho e administração fora das abas

- **WHEN** qualquer aba está ativa
- **THEN** o cabeçalho do torneio e os controles de administração permanecem visíveis no topo

#### Scenario: Troca de aba não recarrega a página

- **WHEN** o usuário alterna entre abas
- **THEN** a troca é instantânea (estado client), sem nova navegação nem refetch das seções

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

### Requirement: Barra de seções do torneio cabe sem rolagem no mobile

A barra de abas do detalhe do torneio (Classificação/Partidas/Rodadas/Vagas) SHALL
caber na largura da tela sem rolagem horizontal no mobile, distribuindo as abas
(2 a 4, conforme o perfil) em colunas de largura igual, com ícone + rótulo curto;
no desktop SHALL exibir o rótulo por extenso. O nome acessível completo de cada
aba SHALL ser preservado (via `sr-only`) em todas as larguras, mantendo leitores
de tela e testes por nome acessível intactos. O contador de pendências (badge)
SHALL permanecer visível.

#### Scenario: Quatro abas em 390px

- **WHEN** um árbitro/gestor de um torneio gerado com rodadas abre o detalhe em
  390px (pior caso, 4 abas)
- **THEN** as quatro abas aparecem lado a lado sem rolagem, com ícone + rótulo
  curto, e o nome acessível completo permanece disponível

### Requirement: Ações de partidas e vagas não estouram a viewport no mobile

Os clusters de ação de partidas e vagas SHALL empilhar em largura total no mobile
e voltar inline no desktop, sem que nenhum botão seja cortado na borda. Os botões
cobertos são Chamar/Solicitar W.O./W.O./Editar placar/Encerrar (partida) e
Copiar/Gerar/Expulsar/Assumir/Desistir (vaga). A URL de convite SHALL quebrar em
linhas (`break-all`) e
permanecer 100% visível e selecionável, sem estourar a largura da tela.

#### Scenario: Card de partida do organizador em 390px

- **WHEN** o organizador vê uma partida com todas as ações disponíveis em 390px
- **THEN** os botões empilham full-width e nenhum fica cortado; a pill de status
  acompanha a linha de informação

#### Scenario: URL de convite legível na aba Vagas

- **WHEN** a aba Vagas é aberta em 390px com o console de moderação
- **THEN** a URL de convite quebra em linhas dentro do card, inteira e
  selecionável, sem vazar a largura da tela

