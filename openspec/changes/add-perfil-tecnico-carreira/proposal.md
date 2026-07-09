## Why

Hoje o perfil do técnico (`/dashboard/ligas/tecnico/[userId]`) mostra pouco: um
herói com contadores "N Clube / N Temporada", a lista de "Clubes comandados" e os
troféus HERDADOS. Não conta a CAMPANHA — quantos jogos o técnico dirigiu, quantos
gols fez e sofreu, seu aproveitamento — nem por clube, nem no total. E não há como
ver o histórico de confronto entre DOIS técnicos: o head-to-head existente é entre
COMPETIDORES dentro de uma mesma pirâmide (`getConfrontoDireto`), não entre pessoas
que passaram por clubes diferentes ao longo do tempo.

Esta change amplia o perfil do técnico para o retrato de carreira que o dono pediu:
todos os clubes que ele passou COM os stats de sempre (jogos, V/E/D, gols
feitos/sofridos, saldo, aproveitamento), e o **confronto direto entre técnicos** —
escolher qualquer adversário que ele já enfrentou e ver o retrospecto agregado.

**Decisões de produto (travadas pelo dono):**
1. **Atribuição PESSOAL por janela de comando.** Os stats contam SOMENTE as partidas
   dos períodos em que o técnico DIRIGIU cada clube — usando as janelas já gravadas
   em `coach_tenures` (`rodada_inicio`/`rodada_fim`). Assumir um clube no meio NÃO
   absorve os jogos do técnico anterior (diferente dos troféus, que são herdados).
2. **Escopo = competições derivadas de liga.** Temporadas de divisão (pontos
   corridos) MAIS o mata-mata DERIVADO de liga — playoff, barragem e grande final
   (`montar_playoff`/`montar_barragem`/`montar_grande_final`, que gravam
   `competitor_id` + técnico na vaga). É exatamente o universo de `coach_tenures` (a
   atribuição é 100% dirigida por ele — zero-DDL). FICAM DE FORA, por construção do
   modelo de dados: as COPAS continentais (participante de copa NÃO tem
   `league_competitor` nem técnico — `montar_copa` grava `competitor_id`/`user_id`
   NULOS, `schema.sql:4527`), os torneios AVULSOS/standalone de clube (vaga com
   `team_id` mas sem `competitor_id`) e o avulso pessoa-vs-pessoa
   (`participante_1/2`). Este é o critério "tudo que tem vaga → competidor
   (`competitor_id`)" — copa e avulso não têm. W.O. conta (0×0, com V/D). Gol contra
   já está no `placar`, então entra naturalmente em gols feitos/sofridos (não lemos
   `match_goals` aqui).

**Zero DDL / read-only.** Tudo é derivado das tabelas existentes
(`coach_tenures`, `matches`, `tournament_slots`, `users.avatar`), pela RLS já em
vigor (o perfil respeita a visibilidade da competição). Nenhuma coluna, RPC,
trigger ou migration. Reusa as primitivas PURAS já testadas do motor de insights
(`resultadoDoLado`, `confrontoDireto`).

## What Changes

- **Atribuição por janela de comando (motor puro + fetcher).** Uma partida
  competitiva ENCERRADA é creditada a um técnico quando um dos seus lados
  (`vaga_1`/`vaga_2`) é uma vaga que ele comandou E a `rodada` da partida cai na
  janela da tenure daquele lado. A janela é **meio-aberta no topo**:
  `(rodada_inicio IS NULL OR m.rodada >= rodada_inicio) AND (rodada_fim IS NULL OR
  m.rodada < rodada_fim)`. Isso casa com a fronteira COMPARTILHADA do trigger de
  tenures (`old.rodada_fim = new.rodada_inicio = v_rodada`, `schema.sql:5844`):
  quem assumiu na rodada da troca fica com ela, quem saiu não — **sem duplicar nem
  perder** o jogo da fronteira. TODAS as partidas creditáveis (vagas com
  `competitor_id`: temporada + mata-mata derivado) têm `rodada` não-nula, então o
  predicado meio-aberto se aplica UNIFORMEMENTE; `partidaNaJanela` trata `rodada`
  nula de forma DEFENSIVA (não-creditável fora de tenure totalmente aberta) — caso
  que não ocorre em partida creditável real. **Limitações conhecidas** (design.md
  §Limitações): (a) troca com a temporada JÁ toda encerrada (fallback `v_rodada =
  max(rodada)`) credita a rodada final a quem ASSUMIU pós-temporada — aceito, raro;
  (b) trocas ANTERIORES a esta feature (backfill = 1 tenure aberta por vaga com o
  técnico FINAL) creditam a temporada inteira ao técnico final — a janela degenera
  em herança para dados backfillados (as trocas passadas nunca foram registradas).
- **"Números de sempre" (campanha agregada).** Bloco de stats no perfil: Jogos,
  Vitórias, Empates, Derrotas, Gols pró, Gols contra, Saldo e Aproveitamento
  (convenção padrão 3-1-0, métrica de exibição — independe das regras de pontuação
  de cada torneio, já que a carreira cruza torneios distintos). Só partidas
  competitivas; W.O. simples credita V/D com 0 gols; duplo W.O. credita derrota aos
  dois com 0 gols (mesmas regras de `resultadoDoLado`).
- **Campanha por clube comandado.** Cada linha de "Clubes comandados" ganha a fatia
  daquele competidor (janela de comando): `J · V-E-D · GP:GC · SG`. O total de
  sempre é a soma das fatias. Agregação chaveada por `competitor_id` (une temporadas
  distintas do mesmo clube numa identidade, como já faz o perfil).
- **Confronto direto entre técnicos (head-to-head global).** Painel no perfil com
  um seletor de adversário (os técnicos com conta que ELE já enfrentou). Ao escolher,
  carrega SOB DEMANDA (Server Action POST, para não disparar prefetch RSC caro — o
  mesmo padrão de `carregarConfrontoDireto`) o retrospecto: J, vitórias do técnico,
  empates, vitórias do adversário, gols pró/contra e a lista dos jogos. Uma partida
  entra no confronto quando um lado é vaga do técnico A e o outro é vaga do técnico
  B, com a `rodada` DENTRO das janelas de comando dos DOIS ao mesmo tempo (ambos
  estavam no comando naquele jogo). Reusa a função pura `confrontoDireto`.
- **Foto real no herói do técnico.** `getTecnicoProfile` passa a selecionar
  `avatar` de `users`; `TecnicoHero` renderiza a foto no `UserAvatar` (hoje sempre
  cai em iniciais). Detalhe barato, coerente com o resto do app.

## Capabilities

### Modified Capabilities
- `coach-history`: perfil do técnico ganha campanha de sempre (agregada e por
  clube), confronto direto entre técnicos e foto real; formaliza o modelo de
  atribuição PESSOAL por janela de comando (meio-aberta), distinto da herança de
  troféus.

## Impact

- **Código de aplicação (novo/alterado):**
  - `src/features/standings/coachStats.ts` (NOVO — puro): `agregarCampanhaTecnico`
    (totais + fatia por `competitor_id`) sobre partidas já creditadas, reusando
    `resultadoDoLado`; helper `partidaNaJanela(rodada, ini, fim)` (meio-aberto;
    trata `rodada` NULL defensivamente). Sem IO.
  - `src/features/standings/insights.ts` (ALTERA — trivial): adiciona `export` a
    `resultadoDoLado` (e ao tipo `ResultadoLado`) para reuso em `coachStats.ts`, para
    NÃO reimplementar a regra de W.O. (hoje são privados do módulo). Não é DDL.
  - `src/features/league/data/getTecnicoCampanha.ts` (NOVO — IO): lê as tenures do
    técnico + as `matches` das vagas dele, resolve o lado + janela por partida,
    entrega a campanha agregada e a lista de adversários enfrentados (com conta).
  - `src/features/league/data/getConfrontoTecnicos.ts` (NOVO — IO): dado (userA,
    userB), resolve as vagas+janelas de cada um, filtra as partidas em que se
    enfrentaram dentro das DUAS janelas, chama `confrontoDireto`.
  - `src/features/league/data/getTecnicoProfile.ts` (ALTERA): `select` inclui
    `avatar`; tipo `TecnicoPerfil` ganha `avatar: string | null`.
  - `src/actions/insights.ts` (ALTERA): nova Server Action POST
    `carregarConfrontoTecnicos(userAId, userBId)` (valida uuids, chama o fetcher).
  - **UI:** `TecnicoHero.tsx` (foto real + faixa de campanha de sempre) ou novo
    `CampanhaDeSempre.tsx` (bloco de totais); `ClubesComandados.tsx` (fatia por
    clube); `ConfrontoTecnicosPanel.tsx` (NOVO — seletor + retrospecto sob demanda,
    espelhando `ConfrontoDiretoPanel`); `page.tsx` do técnico monta os novos blocos.
- **Banco de dados:** NENHUM. Zero DDL, zero RPC, zero migration. Leitura pela RLS
  vigente (`coach_tenures` SELECT espelha `conquistas`; `matches`/`tournament_slots`
  já legíveis pelos fetchers de insights/competidor).
- **Segurança/autorização:** apenas leitura. A campanha por-observador passa por
  DOIS portões de RLS independentes — `matches` (por torneio/liberação) e
  `coach_tenures` (visibilidade da competição): uma partida visível cuja tenure não
  é legível é DESCARTADA (a janela não pode ser verificada), então os totais podem
  variar por observador — comportamento coerente com a lista de "Clubes comandados"
  atual, que já depende de `coach_tenures`. Os novos fetchers usam os mesmos
  caminhos PostgREST dos fetchers de competidor. `userId` validado como uuid (rota e
  Server Action) antes de qualquer query (evita `22P02`). Nenhum dado mutável.
- **Dependências:** nenhuma nova.
- **Testes (vitest, Supabase mockado — não há SQL novo, logo sem pgTAP novo):**
  - Puro `coachStats`: `partidaNaJanela` (meio-aberto; fronteira da troca vai pro
    que ASSUMIU; `rodada` NULL só em tenure totalmente aberta); `agregarCampanhaTecnico`
    (totais e por clube; W.O. simples e duplo; gol contra via placar já contado;
    duas temporadas do mesmo clube somam na mesma fatia).
  - Fetchers: crédito do lado correto por partida; NÃO credita jogo fora da janela;
    adversário sem conta (`user_id` nulo) fora da lista; confronto conta só jogos
    nas DUAS janelas. Suíte atual permanece verde.
