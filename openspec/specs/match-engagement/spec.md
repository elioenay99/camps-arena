# match-engagement Specification

## Purpose
TBD - created by archiving change add-match-engagement. Update Purpose after archive.
## Requirements
### Requirement: Helper de link e mensagem do WhatsApp
O sistema SHALL prover um helper PURO (`src/lib/whatsapp.ts`) que (a)
normaliza o celular para o link `wa.me` — 11 dígitos recebem o DDI 55; 13
dígitos iniciando em 55 entram diretos; qualquer outro formato resulta em
`null` (sem atalho) — e (b) monta a mensagem de convocação ("Fala,
{adversário}! Bora jogar nossa partida do {torneio} no Arena? {url}") com a
URL absoluta da página do torneio (`NEXT_PUBLIC_SITE_URL`) anexada via
`?text=` URL-encoded. Nome e título SHALL ter fallbacks (mensagem sem nome /
"nosso torneio"). O helper SHALL ser a fonte ÚNICA de link/mensagem para
modal, card e listas.

#### Scenario: Celular nacional ganha DDI
- **WHEN** o celular tem 11 dígitos (formato brasileiro)
- **THEN** o link é `https://wa.me/55<digitos>` com a mensagem em `?text=` codificada

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
resolvidos. O texto SHALL conter o título do campeonato, o número da rodada, uma linha por
confronto (nome de cada lado; quando o lado tem comandante, o nome do comandante **e o link
`wa.me`** dele — decisão do dono; quando não tem comandante, a marca ❌) e SHALL terminar com
a URL absoluta da página do campeonato (`NEXT_PUBLIC_SITE_URL`). O texto SHALL ser sem emoji
decorativo (codificação segura em qualquer aparelho; o ❌ é caractere unicode estável e
desejado) e ter fallbacks para título/nome ausentes. O `wa.me` é derivado de `linkWhatsApp`
(o celular entra embutido no link, não cru); o texto é montado no SERVIDOR e passado pronto
ao client. Confrontos já encerrados (sem contato) saem só com nomes (sem `wa.me`).

#### Scenario: Linha por confronto com comandante e wa.me

- **WHEN** a rodada tem o confronto Grêmio × Inter e ambos têm comandante com celular
- **THEN** o texto cita os dois clubes, os nomes dos comandantes e os links `wa.me` deles

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

