# match-engagement Specification

## Purpose
TBD - created by archiving change add-match-engagement. Update Purpose after archive.
## Requirements
### Requirement: Helper de link e mensagem do WhatsApp
O sistema SHALL prover um helper PURO (`src/lib/whatsapp.ts`) que (a)
normaliza o celular para o link `wa.me` reconhecendo **E.164 internacional e o legado
brasileiro** — um valor iniciando em `+` (E.164) usa os dígitos com o DDI já embutido
(`wa.me/<DDI><numero>`); um valor nacional de 11 dígitos recebe o DDI 55; 13 dígitos
iniciando em 55 entram diretos; qualquer outro formato resulta em `null` (sem atalho) — e
(b) monta a mensagem de convocação ("Fala, {adversário}! Bora jogar nossa partida do
{torneio} no Goliseu? {url}") com a URL absoluta da página do torneio
(`NEXT_PUBLIC_SITE_URL`) anexada via `?text=` URL-encoded. Nome e título SHALL ter fallbacks
(mensagem sem nome / "nosso torneio"). O helper SHALL ser a fonte ÚNICA de link/mensagem para
modal, card e listas.

#### Scenario: Celular nacional ganha DDI
- **WHEN** o celular tem 11 dígitos (formato brasileiro legado, sem DDI)
- **THEN** o link é `https://wa.me/55<digitos>` com a mensagem em `?text=` codificada

#### Scenario: Celular internacional em E.164
- **WHEN** o celular está em E.164 (ex.: `+351931482194`)
- **THEN** o link é `https://wa.me/351931482194` (DDI embutido, sem o `+`)

#### Scenario: Celular inválido não gera atalho
- **WHEN** o celular é nulo, vazio ou fora dos formatos reconhecidos
- **THEN** o helper devolve null e nenhum botão é renderizado

#### Scenario: Mensagem com contexto e link
- **WHEN** a mensagem é montada para uma partida do torneio "Copa da Firma"
- **THEN** o texto cita o adversário, o título e termina com a URL absoluta da página do torneio

### Requirement: Atalho de convocação nas superfícies de listagem
O atalho "Chamar" SHALL continuar restrito a quem joga a partida, agora resolvido por VAGA nos formatos competitivos: o botão aparece para o TÉCNICO de uma das vagas, apontando ao celular do TÉCNICO da vaga adversária (mensagem cita o clube adversário e o torneio). Vaga adversária órfã ou sem celular SHALL omitir o botão. Partidas avulsas mantêm o comportamento atual. A contenção de PII por fronteira RSC permanece.

#### Scenario: Convocar o técnico do clube adversário
- **WHEN** o técnico de um clube vê sua partida aberta e o técnico adversário tem celular
- **THEN** o atalho abre o WhatsApp do adversário com a mensagem de convocação

#### Scenario: Clube órfão não gera atalho
- **WHEN** a vaga adversária está sem técnico
- **THEN** nenhum botão é renderizado

### Requirement: Texto do anúncio da rodada

O sistema SHALL prover, em `src/lib/whatsapp.ts` (fonte única), uma função `mensagemRodada`
que monta o texto do anúncio de uma rodada para o WhatsApp a partir dos confrontos já
resolvidos. O cabeçalho SHALL ser `"<título> — <N>a rodada Liberada"` (o anúncio é sempre de
uma rodada liberada). O texto SHALL conter um confronto por linha (nome de cada lado; quando o
lado tem comandante, o nome do comandante **e o link `wa.me`** dele — decisão do dono; quando
não tem comandante, a marca ❌), com os confrontos **separados entre si por uma linha em branco**
(legibilidade no app de mensagens), e SHALL terminar com a URL absoluta da página do campeonato
(`NEXT_PUBLIC_SITE_URL`). O texto SHALL ser sem emoji decorativo (codificação segura em qualquer
aparelho; o ❌ é caractere unicode estável e desejado) e ter fallbacks para título/nome ausentes.
O `wa.me` é derivado de `linkWhatsApp` (o celular entra embutido no link, não cru); o texto é
montado no SERVIDOR e passado pronto ao client. Confrontos já encerrados (sem contato) saem só
com nomes (sem `wa.me`).

#### Scenario: Linha por confronto com comandante e wa.me

- **WHEN** a rodada tem o confronto Grêmio × Inter e ambos têm comandante com celular
- **THEN** o texto cita os dois clubes, os nomes dos comandantes e os links `wa.me` deles

#### Scenario: Confrontos separados por linha em branco

- **WHEN** a rodada tem dois ou mais confrontos
- **THEN** cada confronto fica separado do seguinte por uma linha em branco (mais espaçado/legível)

#### Scenario: Vaga sem comandante recebe ❌

- **WHEN** um lado de um confronto é um clube sem técnico (vaga órfã) ou competidor por nome
- **THEN** a linha marca esse lado com ❌ (sem comandante)

#### Scenario: Texto termina com o link do campeonato

- **WHEN** o texto da rodada é montado
- **THEN** ele termina com a URL absoluta da página do campeonato e não contém emoji

### Requirement: Compartilhar rodada no WhatsApp

O dono SHALL poder COMPARTILHAR uma rodada liberada no WhatsApp por um controle dedicado
(componente client) que entrega a imagem da rodada (PNG) + o texto do anúncio. No celular,
o controle SHALL usar a Web Share API (`navigator.canShare({ files })` →
`navigator.share({ files, text, title })`), permitindo enviar a um grupo em um toque; o
cancelamento do usuário (`AbortError`) NÃO SHALL ser tratado como erro. No desktop (ou onde
o compartilhamento de arquivo não é suportado), o controle SHALL cair em um fallback:
copiar o texto (área de transferência), baixar o PNG e abrir `https://wa.me/?text=` com o
texto. O PNG SHALL ser obtido sob demanda da rota de imagem da rodada via `fetch`
same-origin (cookie de sessão). O controle SHALL aparecer somente para o dono, por rodada
liberada, em formatos gerados (não no avulso).

#### Scenario: Compartilhar no celular em um toque

- **WHEN** o dono toca "Compartilhar" num aparelho com Web Share de arquivos
- **THEN** abre a folha de compartilhamento com a imagem da rodada e o texto, pronta para o
  grupo do WhatsApp

#### Scenario: Fallback no desktop

- **WHEN** o dono clica "Compartilhar" num navegador sem Web Share de arquivos
- **THEN** o texto é copiado, o PNG é baixado e o `wa.me` abre com o texto pré-preenchido

#### Scenario: Cancelar não é erro

- **WHEN** o usuário fecha a folha de compartilhamento sem enviar
- **THEN** nenhum toast de erro aparece (o `AbortError` é ignorado)

#### Scenario: Só o dono e só rodada liberada

- **WHEN** um não-dono vê o campeonato, ou a rodada ainda não foi liberada
- **THEN** o controle de compartilhar não aparece

### Requirement: Contato (`celular`) resolvido por co-participação

O `celular` que alimenta o atalho de convocação e o texto/imagem da rodada NÃO SHALL mais
ser embutido nos embeds PostgREST de `users`. Os fetchers (`getActiveMatches`,
`getTournamentClassificacao`, `getPerfil`) SHALL obter o `celular` exclusivamente pela RPC
gated `public.celulares_de_contato(uuid[])`, que só devolve o número de co-participantes (ou
do próprio usuário). A reinjeção SHALL preservar o contrato consumido a jusante
(`participante_1/2.celular`, `tecnico.celular`, `contato.celular`) sem alterar a UX para
quem é co-participante.

Como consequência, um logado que NÃO compartilha torneio com um competidor — inclusive ao
visualizar um torneio PÚBLICO de terceiros — SHALL ver nomes, placares e a estrutura, mas
NÃO SHALL receber o telefone de ninguém (o atalho/`wa.me` não é renderizado para ele). A
contenção de PII por fronteira RSC permanece.

#### Scenario: Convocação preservada para o co-participante

- **WHEN** o dono/adversário (co-participante) abre o dashboard ou a página do torneio
- **THEN** o `celular` chega via `celulares_de_contato` e o atalho `wa.me` aparece como antes

#### Scenario: Torneio público sem vazar telefone

- **WHEN** um logado não-participante abre um torneio público avulso
- **THEN** ele vê os nomes e os placares, mas nenhum `celular`/atalho de WhatsApp é exposto

### Requirement: Listagem de partidas paginada por rodada

A listagem de partidas de um formato competitivo (partidas com `rodada`) SHALL mostrar UMA rodada
por vez, com um passador que permite ir à rodada anterior / próxima e PULAR direto para uma
rodada específica, em vez de empilhar todas as rodadas. As
partidas EM ABERTO SHALL abrir na rodada ATIVA; as partidas ENCERRADAS SHALL abrir na ÚLTIMA
rodada. O controle "Fechar rodada" (organizador, na rodada ativa) SHALL ficar no cabeçalho do
passador. Partidas AVULSAS (sem `rodada`) SHALL manter a lista plana atual, sem passador. O
passador SHALL ser apresentação client-side, recebendo as partidas já renderizadas no servidor —
o atalho de contato (`wa.me`) continua com a PII embutida no link e NUNCA crua no cliente.

#### Scenario: Uma rodada por vez com passador

- **WHEN** um torneio competitivo tem várias rodadas com partidas
- **THEN** a lista mostra só uma rodada por vez e oferece ir à anterior/próxima e pular para outra

#### Scenario: Abertas abrem na rodada ativa

- **WHEN** a lista de partidas em aberto é exibida
- **THEN** o passador começa na rodada ativa

#### Scenario: Fechar rodada no passador

- **WHEN** o organizador está na rodada ativa
- **THEN** o controle "Fechar rodada" aparece no cabeçalho do passador

#### Scenario: Avulso mantém lista plana

- **WHEN** as partidas não têm rodada (torneio avulso)
- **THEN** a lista é plana, sem passador

### Requirement: Lançamento de placar pelo organizador na listagem de partidas

A listagem de partidas EM ABERTO (aba "Partidas" da página do torneio) SHALL oferecer, a quem
ORGANIZA o campeonato (dono/admin/árbitro — a mesma capacidade que habilita "Encerrar"/"W.O."),
um controle por partida que abre o "Menu da Partida" em **modo direto** para LANÇAR o placar,
reusando o modal existente (`match-score-modal`) e persistindo via a Server Action de
atualização de placar. O controle SHALL aparecer tanto em partidas COMPETITIVAS quanto AVULSAS
em aberto (agendada ou em andamento) e SHALL ficar junto do controle "Encerrar".

O controle NÃO SHALL aparecer para quem não organiza (jogador ou visitante) — para esses, a
listagem permanece inalterada (placar apenas exibido; propor placar continua sendo o fluxo do
técnico pelo "Menu da Partida" do dashboard). A autorização real SHALL permanecer no servidor
(Server Action + RLS); o controle é apenas descoberta/UX. O modal aberto por este controle NÃO
SHALL oferecer busca de clube nem expor telefone (sem lado convocável) — o atalho de convocação
segue no botão "Chamar" da própria linha, com a PII embutida no link no servidor. Partidas
ENCERRADAS SHALL permanecer imutáveis por aqui (correção pelo caminho "Reabrir", que devolve a
partida à listagem em aberto). A paginação por rodada (passador) e a lista plana do avulso SHALL
seguir inalteradas.

#### Scenario: Organizador lança o placar pela aba Partidas

- **WHEN** o dono/admin/árbitro vê uma partida em aberto na aba "Partidas"
- **THEN** um controle abre o "Menu da Partida" em modo direto e salva o placar da partida

#### Scenario: Jogador e visitante não veem o controle

- **WHEN** quem não organiza o campeonato vê a listagem de partidas em aberto
- **THEN** nenhum controle de lançar placar é renderizado (o placar segue apenas exibido)

#### Scenario: Modal do organizador não convoca nem escolhe clube

- **WHEN** o organizador abre o "Menu da Partida" por este controle
- **THEN** o modal permite lançar o placar, sem campo de busca de clube e sem botão de WhatsApp
  interno (o "Chamar" continua na linha da partida)

#### Scenario: Partida encerrada exige reabrir

- **WHEN** o organizador quer corrigir o placar de uma partida já encerrada
- **THEN** ele reabre a partida (histórico), que volta à listagem em aberto e reexibe o controle
  de lançar placar

#### Scenario: Lançar placar não transiciona partida agendada

- **WHEN** o organizador lança o placar de uma partida ainda "agendada"
- **THEN** o placar é gravado mas o status permanece "agendada" (a finalização segue exigindo
  "Encerrar"); a classificação, que só pontua partidas encerradas, não é afetada

#### Scenario: Lançamento direto não descarta proposta pendente

- **WHEN** existe uma proposta de placar pendente de um técnico e o organizador lança o placar
  direto
- **THEN** o placar é gravado, mas a proposta pendente permanece em "Resultados pendentes" até o
  organizador aprová-la ou rejeitá-la

