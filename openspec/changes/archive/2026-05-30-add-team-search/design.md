## Context

O Arena gerencia partidas onde os participantes são **usuários** (`matches.participante_1/2 → users`); a autorização de placar (Fase 4, `updateMatchScore` + RLS `matches_update_participant`) se apoia em `auth.uid() = participante`. Para campeonatos de FIFA/eFootball, cada participante representa um **clube real**, e queremos buscar o clube por nome e trazer nome + escudo de uma API. Premissa: app **pessoal/não comercial**. Pesquisa de viabilidade já realizada (workflow multi-agente com verificação adversarial) embasou as decisões abaixo.

## Goals / Non-Goals

**Goals:**
- Buscar clube real por nome (autocomplete) e obter nome + escudo de uma API confiável e grátis.
- Persistir o clube escolhido (cache) para não rechamar a API a cada exibição.
- Exibir o escudo no dashboard/modal, com fallback gracioso para logo ausente.
- **Preservar intacta** a autorização de placar da Fase 4 (sem mexer em RLS nem em `updateMatchScore`).

**Non-Goals:**
- Estrutura completa de chaveamento/bracket de torneio.
- Upload de escudo customizado pelo usuário (futuro).
- Dados estatísticos do clube (elenco, jogos) — só nome + escudo.
- Uso comercial/licenciamento formal de marcas.

## Decisions

### 1. Provedor: API-Football (api-sports.io)
Escolhido sobre as alternativas porque é o único que combina **busca por nome** (`GET /teams?search=`, ≥3 chars), **campo `logo`** pronto (CDN `media.api-sports.io/football/teams/{id}.png`), **cobertura mundial** (Brasileirão + clubes europeus, 1.200+ ligas) e **tier grátis sem cartão** (100 req/dia; logos não contam na cota).
- _Alternativas consideradas:_ **TheSportsDB** — busca boa, mas a chave grátis "123" só retorna "Arsenal" (exige pago US$9/mês comercial). **football-data.org** — **não tem busca por nome** (só listagem por liga), inviável para autocomplete. **SportMonks** — tier grátis não cobre Brasileirão.

### 2. Modelagem ADITIVA (clube ≠ participante)
Mantém `matches.participante_1/2 → users` (usuário é o participante) e **adiciona** o clube que cada lado representa. Preserva 100% a RLS e a `updateMatchScore` validadas na Fase 4.
- _Alternativa B descartada:_ trocar o participante de *user* para *team* quebraria a RLS (`auth.uid() = participante`) e a checagem de propriedade da action, exigindo mover a autorização para "dono do torneio" — risco alto e retrabalho do que já está testado/validado live.

### 3. Associação: colunas `time_1`/`time_2` em `matches`
Adicionar `time_1 uuid references teams(id)` e `time_2 uuid references teams(id)` em `matches`, espelhando `participante_1/2`. É a mudança mínima e coerente com o modelo per-match atual.
- _Alternativa considerada:_ tabela `tournament_participants` (user + team por torneio) — mais normalizada, mas exige fluxo de inscrição em torneio que ainda não existe. Fica como evolução futura.

### 4. Busca via Server Action + autocomplete client + cache
`src/actions/teams.ts → searchTeams(query)` faz `fetch` à API-Football com `API_FOOTBALL_KEY` (header), **só server-side** (nunca `NEXT_PUBLIC_`, alinhado ao CLAUDE.md). O autocomplete é a folha `"use client"` com **debounce ~350ms**. Ao **selecionar**, o clube é gravado na tabela `teams` (cache) — assim a API só é tocada na digitação, e o limite de 100/dia sobra para uso pessoal.

### 5. Escudo: guardar URL do CDN (não baixar)
Persistir `teams.escudo_url` apontando para `media.api-sports.io`. `next/image` baixa/otimiza server-side (sem CORS no browser). Declarar `media.api-sports.io` em `next.config.ts → images.remotePatterns`.
- _Alternativa considerada:_ baixar para Supabase Storage — dá independência de URL, mas adiciona pipeline, custo e **aumenta a pegada de redistribuição** do escudo (marca). Guardar a URL é mais simples e de menor footprint; `external_id`+`provider` permitem re-resolver se a URL quebrar.

### 6. Fallback de placeholder
Componente de escudo que, sem `escudo_url` (ou em erro de carregamento), renderiza placeholder com **iniciais + cor** do clube — mesma estratégia que EA/Konami usam sem licença, e garante UI consistente.

## Risks / Trade-offs

- [Limite grátis 100 req/dia] → debounce no autocomplete + cache no banco + busca só na criação (não em runtime de partida). Upgrade barato (Pro US$19/mês = 7.500/dia) se crescer.
- [Hotlink do escudo quebra se o CDN mudar] → guardar `external_id`+`provider` para re-resolver; placeholder como fallback de carregamento.
- [Escudo é marca registrada] → uso **pessoal/não comercial**, exibição só para identificação do confronto, atribuição à fonte, escudo substituível/removível. Risco prático baixo nesse contexto.
- [Páginas oficiais da API bloqueiam fetch automatizado (403); preços mudam] → revalidar `api-football.com/pricing` e o formato exato do response com uma chamada real à chave antes de eventual upgrade pago.
- [Cache de clube fica defasado (renome/troca de escudo)] → `external_id` permite refresh manual; aceitável para hobby.

## Migration Plan

1. **Schema (manual):** adicionar a tabela `teams` e as colunas `matches.time_1/time_2` em `supabase/schema.sql`; o usuário aplica no SQL Editor (DDL não automática). Atualizar `src/lib/supabase/database.types.ts` à mão. Atualizar o trigger `lock_match_relations` para também travar reatribuição de `time_1/time_2` via anon/authenticated (apenas service_role corrige).
2. **Env:** adicionar `API_FOOTBALL_KEY` ao `.env.example` (server-side) e ao ambiente.
3. **Código:** Server Action `searchTeams`, schema Zod, componente de autocomplete, componente de escudo+placeholder, `next.config` `remotePatterns`, e integrar na criação de campeonato + exibição no dashboard/modal.
4. **Rollback:** reverter por commit; remoção das colunas/tabela é manual (DDL). Como é aditivo, reverter não afeta o fluxo de placar existente.

## Open Questions

- Associação por **coluna em `matches`** (decisão atual, A1) vs **tabela `tournament_participants`** (A2, mais normalizada) — confirmar A1 para o escopo atual.
- Onde na UI o clube é escolhido: hoje não há fluxo de criação de torneio/partida pronto (partidas vêm de seed) — definir se a escolha do clube entra num futuro formulário de criação ou já num CRUD mínimo de partida.
- Permitir escudo customizado (upload) como complemento — fora do escopo desta change.
