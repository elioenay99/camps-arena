# Design — add-scoring-rules

## Contexto

Decisões de produto do usuário: pontuação por torneio (configurável no form, defaults 3/1/0) e desempate CBF simplificado. O motor de classificação é o entregável central; standings UI é Tier 2.

## Decisões

### D1 — Regras no torneio, motor puro

As 3 colunas vivem em `tournaments` (a regra é do campeonato, não da partida). O motor `computeStandings(regras, partidas)` é uma função PURA — sem Supabase, sem IO — recebe dados e devolve a tabela. Testável exaustivamente; o Tier 2 só liga fetch → motor → render.

### D2 — CHECK de coerência no banco, espelhada no Zod

`0 <= pontos_derrota <= pontos_empate <= pontos_vitoria <= 100`. Uma configuração onde derrota vale mais que vitória corromperia toda classificação; barrar no banco protege contra POST direto e edição futura. Teto 100 é sanidade (evita overflow visual/abuso). O Zod espelha com refine + mensagens pt-BR.

### D3 — Conversão explícita do form, sem `z.coerce`

Mesma decisão do placar (`matchSchema.ts`): `z.coerce.number()` aceitaria lixo silencioso num caminho alcançável por POST direto. A action converte com `Number()` + validação `Number.isInteger` via Zod (`z.number().int()`), tratando `""`/ausente como default.

### D4 — Semântica do motor

- **Elegibilidade**: só partidas `status = 'encerrada'` E com ambos os participantes definidos pontuam. Partida sem participante (TBD) ou não-encerrada é ignorada.
- **Linhas da tabela**: um participante entra na tabela se aparece em ao menos UMA partida elegível (não existe tabela `participants` ainda — Tier 3).
- **Acumuladores por participante**: jogos, vitórias, empates, derrotas, gols pró, gols contra, saldo, pontos (`v*pontos_vitoria + e*pontos_empate + d*pontos_derrota`).
- **Ordenação em cadeia**: pontos desc → vitórias desc → saldo desc → gols pró desc → confronto direto → empate persistente.
- **Confronto direto**: aplicado SÓ quando exatamente 2 participantes seguem empatados após os critérios anteriores (regra CBF; com 3+ o critério é pulado — evita o ciclo não-determinístico A>B>C>A). Considera os pontos obtidos nas partidas elegíveis ENTRE os dois, com as MESMAS regras do torneio.
- **Empate persistente**: participantes indistinguíveis dividem a `posicao` (estilo competição: 1º, 1º, 3º) e são ordenados de forma estável/determinística (por id) apenas para apresentação.

### D5 — Defaults no INSERT

A action SEMPRE envia os 3 valores (não confia no default do banco para o caminho da app) — o default do DDL existe para torneios legados e inserções administrativas. O form pré-preenche 3/1/0; campo vazio no form vira o default correspondente (UX de "não mexi, vale o padrão").

## Riscos

- **Torneios legados**: herdam 3/1/0 via DDL default — exatamente a convenção esperada; nenhuma migração de dados.
- **Mudança de regra com partidas já encerradas**: o motor recalcula tudo a cada chamada (sem materialização), então mudar a pontuação reordena a tabela retroativamente. Aceito: é o comportamento natural de "regra do campeonato"; a tela de edição nem existe ainda.
- **Confronto direto entre 2 com partidas multi-jogo**: soma TODOS os confrontos elegíveis entre os dois (ida/volta/n jogos) — determinístico.
