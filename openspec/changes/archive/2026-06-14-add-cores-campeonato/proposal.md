# Proposal — add-cores-campeonato

## Why

Hoje todo campeonato (torneio ou pirâmide de liga) usa a mesma identidade visual do
app (Dracula no escuro / Canarinho no claro). O dono quer que **cada campeonato tenha
sua própria identidade de cor** — como ligas reais têm — e que **cada divisão de uma
pirâmide tenha as suas**. Essa identidade deve aparecer **nas páginas do campeonato
dentro do app** (não só num cartão) e servir de base para a futura **imagem de rodada**
compartilhável no WhatsApp.

Esta change é o **primeiro pedaço** de um conjunto maior já desenhado com o dono
(liberação de rodadas com cadência + payload de WhatsApp com lista e imagem). As cores
são a fundação porque a imagem e a marca do campeonato as consomem; liberação e WhatsApp
virão em changes seguintes e reusam o que aqui se estabelece.

Decisões de produto já tomadas com o dono (não reverter sem perguntar):
- **Duas cores** por campeonato/divisão: `primária` + `secundária` (picker livre, hex).
- As cores **tematizam as páginas do campeonato no app** (não só a imagem).
- A **nav global continua a marca Goliseu**; só o conteúdo do campeonato veste as cores.
- Zona de **queda/playout** continua **semântica** (vermelho fixo); a zona de **acesso**
  pode adotar a primária do campeonato (já usa `--primary` hoje).
- Geração do PNG da rodada e liberação/WhatsApp ficam **fora** desta change.

## What Changes

Introduz a **identidade de cor por campeonato/divisão** com tematização dinâmica das
páginas, sempre legível em claro e escuro.

- **Dados (DDL aditiva)**: `cor_primaria` + `cor_secundaria` (text, hex `#rrggbb`,
  *nullable*, CHECK de formato) em `tournaments`, em `league_competitions` (default da
  pirâmide) e em `league_division_seasons` (override por divisão). *Null* em qualquer
  nível ⇒ herda o nível acima e, no fim, o padrão do app. Mutável a qualquer momento.

- **Tematização SSR-safe**: um wrapper de servidor (`ChampionshipTheme`) envolve o
  conteúdo da página do campeonato e injeta as cores **cruas** como custom properties
  inline (`--brand-primary`/`--brand-secondary`). O `globals.css` deriva, **por tema**
  (`:root` vs `.dark`), os tokens normalizados (`--primary`, `--primary-foreground`,
  `--ring`, `--brand-secondary` normalizada) via `oklch(from var(--brand-…) <L> c h)` —
  matiz preservado, luminância normalizada para a faixa legível do tema ativo. Sem JS,
  sem mismatch de hidratação, recolore sozinho ao alternar claro/escuro. Fallback para
  navegadores sem relative-color-syntax: usa a cor crua.

- **Identidade visual**: componente `ChampionshipIdentity` (escudo com gradiente
  primária→secundária + título) no cabeçalho de `torneios/[id]` e `ligas/[id]` (e por
  divisão na liga). Botões/realces/links já recolorem por herdarem `--primary`.

- **Picker + edição**: componente `ColorField` (nativo, sem lib) com preview. Adicionado
  ao `TournamentForm` (criação) e ao `LeagueWizard` (default da pirâmide + por divisão,
  com herança). Como **não existe tela de edição** de campeonato hoje, cria-se uma tela
  enxuta de **edição de cores** (`/dashboard/torneios/[id]/cores` e
  `/dashboard/ligas/[id]/cores`), só para o dono, com a identidade mutável.

- **Schema/Actions**: `tournamentSchema` e `leaguePyramidSchema` ganham `corPrimaria`/
  `corSecundaria` (opcionais, validadas). `createTournament`/`createCompetition` gravam
  as cores; `montarProximaTemporada` **copia** as cores das divisões para a temporada N+1
  (mesma máquina que já copia o restante da config da divisão). Actions novas
  `atualizarCoresTorneio`/`atualizarCoresDivisao`/`atualizarCoresPiramide` (checagem de
  posse + RLS).

Fora de escopo (changes seguintes): PNG da rodada, liberação de rodadas com cadência,
envio/compartilhamento no WhatsApp.
