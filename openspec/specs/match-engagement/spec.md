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

