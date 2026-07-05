## Why

Hoje a classificação do Goliseu mostra só o essencial de pontos corridos —
P/J/V/E/D/GP/GC/SG. Os dados para uma camada de INSIGHTS competitivos JÁ existem
em `matches` (placar, status, W.O., rodada, `created_at`): forma recente, maiores
sequências, goleadas, melhor ataque/defesa, e o histórico de confronto direto
entre dois competidores. Extrair esse valor **sem pedir nenhum input novo** ao
usuário dá profundidade à leitura da liga/torneio e à página do competidor
persistente da pirâmide, na mesma linha da vitrine (pirâmide + hall da fama) e da
artilharia já entregues.

O motor `computeStandings` hoje só ACUMULA — não guarda a ORDEM dos jogos, então
"forma" e "sequências" exigem uma nova camada PURA que ordene cronologicamente. E
o cálculo de confronto direto que o motor já faz no desempate (a closure
`pontosConfronto`) está preso dentro de `computeStandings`; o painel de confronto
histórico precisa dessa mesma lógica exposta e reutilizável.

Esta change é 100% derivável dos dados existentes: **ZERO mudança de schema/DDL**,
zero input novo, zero dependência de `match_goals` (goleada/média usam o PLACAR).

## What Changes

- **Refactor behavior-preserving do confronto direto (`standings-engine`).** A
  lógica de pontos par-a-par hoje embutida na closure `pontosConfronto`
  (`computeStandings.ts` ~344-370) é EXTRAÍDA para uma função PURA exportada
  (`pontosDoConfronto(eu, rival, partidas, regras)`), que o motor passa a
  consumir no desempate de 2. Comportamento IDÊNTICO — a suíte atual permanece
  100% verde. A extração habilita o reuso pelos insights.
- **Nova camada PURA de insights (`standings-insights`, nova capacidade).** Três
  funções sem IO, no estilo de `computeStandings` (exaustivamente testáveis):
  - `calcularForma(partidas)` → por participante, a lista CRONOLÓGICA de
    resultados (V/E/D). A UI mostra os últimos 5. Espelha `aplicarPartida`
    (W.O. → V/D; duplo W.O. → D/D) — mesma fonte de verdade do motor.
  - `calcularDestaques(linhas, regras, partidas)` → melhor ataque (maior GP) e
    defesa (menor GC) da classificação; maior goleada (maior `|placar_1−placar_2|`
    numa partida, W.O. excluído); maiores sequências de invencibilidade, vitórias
    e clean sheets; média de gols por jogo (gols reais / jogos jogados).
  - `confrontoDireto(idA, idB, partidas)` → histórico agregado entre dois: lista
    de jogos (placar, rodada, vencedor), V/E/D de cada lado e gols pró/contra no
    confronto. Reutiliza a mesma elegibilidade/creditação do motor.
- **Chave de ordenação cronológica.** As três funções recebem partidas com
  `{ rodada, created_at, id }` e ordenam por `rodada` asc → `created_at` asc →
  `id` asc (mesmo critério de disputa já usado em `partidasAbertas`). Sem coluna
  nova: `getTournamentClassificacao` JÁ seleciona esses campos.
- **Camada de dados (fetchers).** Forma + destaques são computados a partir das
  partidas que os fetchers de classificação JÁ carregam (ZERO query extra):
  `getTournamentClassificacao` (torneio) e `getDivisionStandings` (liga/divisão)
  passam a devolver um bloco `insights`. Para a página do competidor, novos
  fetchers `server-only`: `getCompetidorInsights` (forma + destaques do
  competidor, resolvendo competidor→slots→matches na mesma linha de
  `getArtilheirosDoCompetidor`), `getConfrontoDireto` (par de competidores) e
  `getRivaisDoCompetidor` (lista de rivais da mesma competição para o picker).
- **UI.** Aba Classificação (torneio e liga): coluna "Forma" (badges V/E/D dos
  últimos 5, com `aria-label`) + bloco de "Destaques" (RSC). Página do competidor:
  forma + destaques + painel de confronto direto com um picker de rival (ÚNICA
  folha `"use client"`; tudo o mais RSC). Grupos de copa ficam fora do MVP de UI
  (compute é genérico; opcional se encaixar barato).

## Capabilities

### New Capabilities
- `standings-insights`: camada de insights derivados das partidas — forma
  recente (últimos 5), destaques automáticos do torneio/divisão (ataque/defesa,
  goleada, sequências, média de gols) e painel de confronto direto histórico
  entre dois competidores. Sem input novo, sem mudança de schema.

### Modified Capabilities
- `standings-engine`: o cálculo de pontos do confronto direto é extraído para uma
  função pura exportada e reutilizável, consumida pelo próprio motor sem alterar
  o resultado da classificação.

## Impact

- **Código de aplicação (compute puro):**
  - `src/features/standings/computeStandings.ts` (exporta `pontosDoConfronto`; a
    closure `pontosConfronto` passa a delegar — behavior-idêntico).
  - `src/features/standings/insights.ts` (NOVO: `calcularForma`,
    `calcularDestaques`, `confrontoDireto` + tipos `ItemForma`, `Destaques`,
    `ConfrontoDireto`, `PartidaCronologica`).
- **Camada de dados:**
  - `src/features/standings/data/getTournamentClassificacao.ts` (devolve
    `insights` computado da MESMA query — sem viagem extra).
  - `src/features/league/data/getDivisionStandings.ts` (idem para a divisão).
  - `src/features/league/data/getCompetidorInsights.ts` (NOVO: forma + destaques
    do competidor).
  - `src/features/league/data/getConfrontoDireto.ts` (NOVO: histórico entre dois
    competidores).
  - `src/features/league/data/getRivaisDoCompetidor.ts` (NOVO: rivais da
    competição para o picker).
- **UI:**
  - `src/features/standings/components/StandingsTable.tsx` +
    `ClassificacaoResponsiva.tsx` (coluna "Forma", bloco "Destaques").
  - `src/features/league/components/competidor/` (forma + destaques + painel de
    confronto com picker `"use client"`).
- **Banco de dados:** NENHUMA mudança. Sem DDL, sem migration, sem `match_goals`.
- **Segurança/autorização:** os insights são computados sobre EXATAMENTE as
  partidas que a RLS de `matches` já entrega ao leitor (não-dono só vê rodada
  liberada) — nenhum insight vaza rodada oculta; nenhum fetcher usa `service_role`.
- **Dependências:** nenhuma nova.
- **Testes:** unitários das três funções puras (forma cronológica, W.O. na forma,
  <5 jogos, zero jogos, sequências com empate, goleada exclui W.O., média,
  confronto vazio/agregado); regressão do motor (todos os testes atuais verdes
  após a extração); Supabase mockado nos fetchers.
