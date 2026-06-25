# club-slots — Delta Spec

## ADDED Requirements

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
