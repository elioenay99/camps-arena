# match-engagement — Delta Spec

## ADDED Requirements

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
