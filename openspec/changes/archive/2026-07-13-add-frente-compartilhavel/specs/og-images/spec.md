## ADDED Requirements

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
