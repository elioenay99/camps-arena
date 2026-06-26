# match-engagement — Delta Spec

## MODIFIED Requirements

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
