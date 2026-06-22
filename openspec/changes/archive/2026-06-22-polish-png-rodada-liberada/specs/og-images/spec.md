## MODIFIED Requirements

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
