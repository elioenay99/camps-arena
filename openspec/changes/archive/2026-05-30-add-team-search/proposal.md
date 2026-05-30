## Why

Em campeonatos de FIFA/eFootball cada participante representa um **clube real**. Hoje o modelo só conhece o usuário (sem identidade de clube), e inserir clube à mão (nome + logo) seria lento e inconsistente. Esta change adiciona uma **busca de clube por nome** que traz nome + escudo de uma API e usa direto, deixando a criação de campeonato rápida e padronizada. Uso **pessoal/não comercial**.

## What Changes

- Nova Server Action `searchTeams` em `src/actions/teams.ts` que consulta a **API-Football** (chave somente server-side) e retorna clubes (nome + escudo) por busca de nome.
- Componente de **autocomplete** (Client Component, debounce ~350ms) para escolher o clube de cada participante na criação de campeonato/partida.
- Nova tabela **`teams`** (cache dos clubes selecionados: `nome`, `escudo_url`, `external_id`, `provider`) em `supabase/schema.sql` — salva no momento da seleção para não rechamar a API a cada exibição.
- Associação **ADITIVA** de um clube a cada lado da partida: o participante **continua sendo o usuário** (`matches.participante_1/2 → users`), preservando RLS e `updateMatchScore` da Fase 4 **sem alteração**.
- Exibição do escudo via `next/image`, com **placeholder** (iniciais + cores) como fallback para logo ausente/quebrado.
- `next.config.ts`: `images.remotePatterns` para `media.api-sports.io`.
- Nova env `API_FOOTBALL_KEY` (server-side, **nunca** `NEXT_PUBLIC_`).

## Capabilities

### New Capabilities
- `team-search`: busca de clube real por nome, seleção, cache no banco e exibição (escudo + placeholder de fallback), com a chave da API protegida no servidor.

### Modified Capabilities
<!-- Nenhuma. A modelagem é ADITIVA: usuários como participantes, RLS de matches e a
     Server Action updateMatchScore permanecem inalterados. O clube é uma camada de
     identidade visual acrescentada, não uma troca do contrato de participante. -->

## Impact

- **Código novo:** `src/actions/teams.ts` (Server Action de busca), `src/features/team/**` (autocomplete + componente de escudo/placeholder), `src/schema/teamSchema.ts` (Zod), ajustes em `next.config.ts` e nos formulários de criação de campeonato.
- **Dados (DDL manual — fonte de verdade `supabase/schema.sql`):** nova tabela `teams` + associação do clube por lado da partida (decisão de design entre coluna `time_1/time_2` em `matches` vs tabela de inscrição); `src/lib/supabase/database.types.ts` atualizado à mão.
- **Dependências:** nenhuma lib nova obrigatória (usa `fetch` nativo). Provedor externo: API-Football (tier grátis, 100 req/dia, sem cartão).
- **Externo/infra:** chamadas à API-Football no autocomplete; escudos servidos do CDN `media.api-sports.io`.
- **Segurança/legal:** chave de API só server-side. Escudos são marca registrada dos clubes — exibidos para **identificação** em app **pessoal/não comercial**; manter atribuição à fonte de dados. Sem impacto na RLS nem na autorização de placar.
