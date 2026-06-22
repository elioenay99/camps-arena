## MODIFIED Requirements

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
