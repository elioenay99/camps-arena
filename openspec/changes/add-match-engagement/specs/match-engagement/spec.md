# match-engagement — Delta Spec

## ADDED Requirements

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
O sistema SHALL exibir o botão "Chamar {adversário}" (link `wa.me` com a
mensagem de convocação) no card de partida do DASHBOARD e nas PARTIDAS EM
ABERTO da página do torneio. O botão SHALL ser renderizado SOMENTE quando o
usuário logado é participante daquela partida E o adversário tem celular
normalizável — a decisão SHALL acontecer no servidor (componentes RSC): o
celular do adversário SÓ SHALL chegar ao navegador, dentro do `href`, para
quem é participante da partida. Visitantes, dono não-participante e demais
participantes do torneio NÃO SHALL receber o dado nem ver o botão.

#### Scenario: Participante vê o atalho no dashboard
- **WHEN** um participante de partida aberta vê o card no dashboard e o adversário tem celular
- **THEN** o card mostra "Chamar {adversário}" apontando para wa.me com a mensagem pronta

#### Scenario: Participante vê o atalho na página do torneio
- **WHEN** um participante abre a página do torneio com partidas em aberto dele
- **THEN** cada partida DELE em aberto mostra o atalho para o respectivo adversário

#### Scenario: Não-participante não vê atalho nem celular
- **WHEN** um visitante, o dono não-participante ou outro participante vê as mesmas listas
- **THEN** nenhum botão de chamada é renderizado e nenhum celular aparece no HTML recebido

#### Scenario: Adversário sem celular não gera botão
- **WHEN** o adversário não tem celular cadastrado (ou em formato inválido)
- **THEN** o atalho não é renderizado para aquela partida
