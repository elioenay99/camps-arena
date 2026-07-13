# og-images Specification

## Purpose
TBD - created by archiving change add-og-images. Update Purpose after archive.
## Requirements
### Requirement: Card OG/Twitter estático da marca em todas as rotas

O app SHALL expor um `opengraph-image` e um `twitter-image` na raiz, gerados por
código (`next/og`), produzindo um card 1200×630 PNG com a identidade da marca
Arena (escudo, wordmark, tagline, cores da marca). Por serem definidos na raiz,
SHALL ser herdados por todas as rotas, de modo que qualquer link compartilhado
(landing, login, cadastro, convite) renderize o mesmo preview da marca. O metadata
do layout SHALL declarar `openGraph` (type/siteName/title/description/locale) e
`twitter` (`summary_large_image`); as tags de imagem (`og:image`,
`twitter:image`, com width/height/type/alt) SHALL vir dos arquivos de imagem,
resolvidas em URL absoluta via `metadataBase`.

#### Scenario: Link da landing tem preview da marca

- **WHEN** um crawler busca a landing (`/`)
- **THEN** o HTML inclui `og:image` e `twitter:image` apontando para o card
  1200×630 da marca, com `og:image:alt` descritivo

#### Scenario: Rota pública herda o card

- **WHEN** um crawler busca uma rota pública sem imagem própria (ex.: `/login`,
  `/convite/[codigo]`)
- **THEN** ela herda o `og:image`/`twitter:image` da raiz (card da marca)

### Requirement: O preview não vaza dados de torneio ou convite

O card OG SHALL ser estático e da marca — NÃO SHALL conter nome de torneio,
clube, participante ou qualquer dado específico de convite/torneio. A página de
convite SHALL manter seu `<title>` genérico ("Convite · Arena"), preservando a
decisão de privacidade existente (o título do torneio só aparece no corpo, para
quem tem o código e está autenticado).

#### Scenario: Preview do convite não revela o torneio

- **WHEN** um crawler (anônimo) busca `/convite/[codigo]`
- **THEN** o `<title>` permanece "Convite · Arena" e o `og:image` é o card
  genérico da marca — sem o nome do torneio em nenhum metadado

### Requirement: As rotas de imagem não passam pela CSP por nonce

As rotas `opengraph-image`/`twitter-image` (resposta `image/png`) SHALL ser
excluídas do matcher do middleware, de modo que não recebam header de CSP/nonce
nem disparem verificação de sessão a cada requisição de crawler.

#### Scenario: PNG do card sem CSP

- **WHEN** o card OG é requisitado
- **THEN** a resposta é `image/png` sem header `Content-Security-Policy` nem `x-nonce`

### Requirement: Imagem da rodada (rota dinâmica autenticada)

O sistema SHALL gerar a imagem de uma rodada como um PNG via `next/og` (Satori), exposto
por um Route Handler GET em `app/dashboard/torneios/[id]/rodada/[rodada]/imagem`. A rota
SHALL ser auth-gated (passa pelo proxy/sessão) e SHALL checar a posse do campeonato
(`tournaments.created_by = auth.uid()`); um não-dono ou torneio inexistente SHALL receber
404/negação, sem oráculo. Diferente do card OG estático da marca, esta rota é DINÂMICA e
lida no contexto do DONO autenticado (a RLS de `matches` lhe entrega a rodada).

A imagem SHALL conter a marca, "Nª RODADA" com um selo **"LIBERADA"** ao lado (na cor de
destaque do campeonato) e os confrontos da rodada — cada lado com o escudo do clube
(`teams.escudo_url`, embutido como data URL) ou, quando por-nome/sem escudo, um **monograma**
(inicial sobre cor estável). A imagem SHALL ser tematizada pelas **cores** do campeonato
(`resolverCoresTorneio`, sempre hex `#rrggbb` ou ausentes — Satori aceita), caindo no tema base
quando o campeonato não tem cor. A geração SHALL respeitar as restrições do Satori (flexbox, sem
grid, cores em hex) e reusar as fontes/logo do OG da marca (sem duplicar o carregamento de assets).

A largura SHALL ser fixa (1080) e a **altura SHALL ser dinâmica**, calculada a partir do
número de confrontos visíveis, de modo que TODOS os confrontos visíveis apareçam **sem
corte** e o rodapé fique sempre **abaixo** do último confronto (sem sobreposição). O selo
"LIBERADA" SHALL ficar na MESMA linha do "Nª RODADA" (altura dominada pelo número), de modo a
não alterar a altura do cabeçalho. A altura SHALL ter um **piso** que preserve o formato
aproximadamente quadrado das rodadas pequenas. O número de confrontos desenhados SHALL ter um
teto suficiente para uma rodada de liga com 20 clubes (10 jogos) e fases de grupos; confrontos
além do teto SHALL ser indicados por um rodapé "+N confrontos".

#### Scenario: Dono gera a imagem da rodada

- **WHEN** o dono requisita a imagem de uma rodada liberada do seu campeonato
- **THEN** recebe um PNG com os confrontos da rodada tematizado pelas cores do campeonato

#### Scenario: A imagem indica que a rodada está liberada

- **WHEN** o dono gera a imagem de uma rodada
- **THEN** a imagem mostra o selo "LIBERADA" ao lado de "Nª RODADA", na cor de destaque do campeonato

#### Scenario: Rodada com muitos jogos não corta

- **WHEN** o dono gera a imagem de uma rodada com muitos confrontos (ex.: 10 jogos de um Brasileirão)
- **THEN** a imagem cresce em altura e mostra TODOS os confrontos visíveis, com o rodapé abaixo do último, sem cortar nem sobrepor

#### Scenario: Lado por-nome usa monograma

- **WHEN** um lado do confronto é um competidor por nome (sem clube/escudo)
- **THEN** a imagem desenha um monograma (inicial) no lugar do escudo

#### Scenario: Não-dono não gera a imagem

- **WHEN** um usuário que não é dono do campeonato requisita a rota da imagem
- **THEN** a resposta é negada (404), sem revelar a existência do recurso

#### Scenario: Campeonato sem cor usa o tema base

- **WHEN** o campeonato não tem cores definidas
- **THEN** a imagem usa o tema base do app (sem quebrar a geração)

### Requirement: Pôster "Temporada encerrada"
O sistema SHALL expor um Route Handler de imagem (PNG via `next/og`) que renderiza
um pôster "Temporada encerrada" para uma temporada de liga, reusando o
estilo/marca do card de rodada (`renderRodadaOg`), destacando o campeão da
divisão de elite e os promovidos/rebaixados. A rota SHALL ser restrita ao dono da
liga (auth-gated, 404 sem oráculo de existência para quem não tem posse), no
mesmo padrão da imagem de rodada.

#### Scenario: Dono obtém o pôster
- **WHEN** o dono da liga acessa a rota de imagem da temporada encerrada
- **THEN** um PNG com o campeão e os promovidos/rebaixados é retornado (200)

#### Scenario: Sem posse retorna 404 sem vazar existência
- **WHEN** um usuário sem posse (ou anônimo) acessa a rota de imagem da temporada
- **THEN** a resposta é 404, sem revelar se a temporada existe

### Requirement: Card de resultado de partida (rota dinâmica, qualquer logado)

O sistema SHALL gerar a imagem de RESULTADO de uma partida encerrada como PNG via
`next/og` (Satori), exposto por um Route Handler GET em
`app/dashboard/torneios/[id]/partida/[matchId]/imagem`. A rota SHALL exigir sessão
(`auth.getUser()`) mas NÃO SHALL checar posse do campeonato; a imagem SHALL ser
montada com o cliente Supabase DO USUÁRIO, deixando a RLS decidir o acesso. O fetcher
SHALL projetar `tournament_id` e a rota SHALL exigir `match.tournament_id === id` da
URL — divergência, recurso ausente ou não entregue pela RLS (ex.: rodada não liberada
para não-dono) SHALL resultar em 404 sem oráculo de existência. A imagem SHALL conter
a marca, os dois lados e o **placar** em destaque; cada lado SHALL usar o escudo do
clube (competitivo) ou, no caminho AVULSO, o nome do participante com a foto
(`avatarUrl`) quando houver, caindo em monograma quando não há escudo nem foto. Os
selos SHALL ser derivados do modelo sem coluna nova: **GOLEADA** quando `wo=false` e
`|placar_1 − placar_2| ≥ 3`; **W.O.** quando `wo=true` e `wo_duplo=false` (indicando o
vencedor); **W.O. DUPLO** quando `wo_duplo=true`. SHALL ser tematizada pelas cores do
campeonato (`resolverCoresTorneio`) e reusar fontes/logo/allowlist compartilhados.

#### Scenario: Logado com acesso gera o resultado
- **WHEN** um usuário autenticado que enxerga a partida requisita a rota de imagem do resultado
- **THEN** recebe um PNG com o placar e os dois lados, tematizado pelas cores do campeonato

#### Scenario: Partida de outro torneio na URL
- **WHEN** o `matchId` existe mas pertence a um `tournament_id` diferente do `[id]` da rota
- **THEN** a resposta é 404, sem servir a imagem com a cor/contexto do torneio da URL

#### Scenario: Goleada ganha selo
- **WHEN** o resultado tem diferença de 3 ou mais gols e não é W.O.
- **THEN** a imagem exibe o selo GOLEADA

#### Scenario: W.O. e W.O. duplo são sinalizados
- **WHEN** a partida foi W.O. (simples ou duplo)
- **THEN** a imagem exibe o selo W.O. (com o vencedor) ou W.O. DUPLO, conforme o caso

#### Scenario: Partida avulsa usa nome/foto do participante
- **WHEN** a partida é de um torneio avulso (por nome, sem clube)
- **THEN** cada lado mostra o nome do participante (foto quando houver, senão monograma), nunca "A definir"

#### Scenario: Sem acesso não vaza existência
- **WHEN** um usuário sem acesso àquela partida (ou anônimo) requisita a rota
- **THEN** a resposta é 404/negação, sem revelar se a partida existe

### Requirement: Card de classificação (torneio de liga e divisão de pirâmide)

O sistema SHALL gerar a imagem da CLASSIFICAÇÃO como PNG via `next/og`, servida por
dois Route Handlers GET auth-gated (sessão, sem posse), montados com o cliente
Supabase do usuário (RLS decide; tabela pode sair parcial para não-dono):
`app/dashboard/torneios/[id]/classificacao/imagem` — restrita a torneio de formato
**liga** (pontos corridos), via `getTournamentClassificacao(id).linhas` (sem zonas) — e
`app/dashboard/ligas/[id]/temporada/[seasonId]/divisao/[divisionSeasonId]/imagem` — via
`getDivisionStandings(divisionSeasonId, userId, fronteiras)`, LENDO o `.zonas` já
pronto do retorno (sem recomputar) e cobrindo o split Apertura+Clausura combinado. Um
único renderer `renderClassificacaoOg({ linhas, zonas? })` SHALL servir ambos,
desenhando por linha posição, escudo (ou foto `avatarUrl` no avulso, ou monograma),
nome, pontos e P/J/V/E/D/SG, com **faixas de zona** quando `zonas` é fornecido. A
altura SHALL ser dinâmica com piso e um teto de linhas ("+N" para o excedente). O
formato de **grupos** NÃO SHALL ser coberto por esta requirement (o `.linhas` ali é um
agregado que a UI não exibe como tabela única — fica como frente futura). Recurso não
entregue pela RLS ⇒ 404 sem oráculo.

#### Scenario: Card de classificação de torneio de liga
- **WHEN** um usuário autenticado requisita a imagem de classificação de um torneio de formato liga que enxerga
- **THEN** recebe um PNG com a tabela (posição, escudo/foto, nome, pontos e saldo)

#### Scenario: Card de classificação de divisão com zonas
- **WHEN** a imagem é de uma divisão de pirâmide com fronteiras de acesso/rebaixamento
- **THEN** a tabela mostra as faixas de zona (sobe/cai) nas posições corretas

#### Scenario: Split combinado
- **WHEN** a divisão está em formato de split (Apertura + Clausura)
- **THEN** a tabela renderizada é a anual COMBINADA (mesma regra do app), não a de um único turno

#### Scenario: Torneio de grupos não oferece o card
- **WHEN** o torneio é de formato de grupos
- **THEN** a rota/botão de classificação não é oferecida (fora do escopo desta change)

### Requirement: Pôster pessoal do técnico (rota dinâmica, qualquer logado)

O sistema SHALL gerar um pôster pessoal do técnico como PNG via `next/og`, servido por
um Route Handler GET auth-gated em `app/dashboard/ligas/tecnico/[userId]/imagem`
(sessão, sem posse — a carreira do técnico já é leitura pública a logados). A rota
SHALL usar `getTecnicoProfile(supabase, { userId })` como GATE de existência (null ⇒
404 sem oráculo) e fonte de nome + foto/avatar; `getTecnicoCampanha(supabase, {
userId })` para a campanha de sempre (J/V/E/D + aproveitamento — `agregarCampanhaTecnico`
é seu helper puro interno); e `getConquistasDoTecnico` para os troféus. O renderer
`renderTecnicoOg` SHALL desenhar avatar/foto, nome, os números de carreira e os
títulos, reusando fontes/logo/allowlist compartilhados. Um técnico que existe mas não
tem histórico visível NÃO SHALL ter o botão de compartilhar exibido (evita "pôster de
nada"); se a rota for acessada diretamente nesse caso, SHALL degradar graciosamente
(pôster com o nome, sem números inventados).

#### Scenario: Pôster do técnico com carreira
- **WHEN** um usuário autenticado requisita a imagem do perfil de um técnico com histórico
- **THEN** recebe um PNG com foto, nome, campanha de sempre e troféus do técnico

#### Scenario: Perfil de técnico inexistente
- **WHEN** o `userId` não corresponde a um perfil de técnico (`getTecnicoProfile` null)
- **THEN** a resposta é 404, sem vazar existência

