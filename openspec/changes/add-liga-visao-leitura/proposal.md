## Why

A página da temporada de uma pirâmide (`/dashboard/ligas/[id]`) foi construída
**apenas como console de gestão**. Todo o carregamento é gateado por capacidade
GERIR no app-layer: `getSeason` retorna `null` para quem não é dono/admin da liga
→ a página faz `notFound()` → **404**. Um jogador comum (técnico de uma divisão)
que abre a liga-mãe recebe 404 e não consegue ver classificação, rodadas,
playoffs nem o sobe/cai — embora consiga ver a própria divisão (a página de
torneio já é pública para logados).

A causa foi CONFIRMADA por investigação (workflow adversarial + introspecção no
PROD): **não é RLS**. As policies `league_*_select_visivel` já liberam a leitura
de qualquer liga `ativa` para `anon`/`authenticated`; todo camp em produção é
público. O bloqueio é 100% na aplicação — os loaders de leitura
(`getSeason`, `getDivisionStandings`, `getPlayoffs`, `getGrandeFinal`) impõem um
gate de capacidade (`podeGerir` / `podeVerBastidores`) MAIS ESTRITO que a RLS e
zeram os dados para não-gestores/não-membros.

## What Changes

- A página `/dashboard/ligas/[id]` passa a ter **visão de leitura para qualquer
  usuário logado** (mesmo modelo da página de torneio de divisão): `redirect`
  para login se não há sessão; caso contrário, renderiza classificação de todas
  as divisões, playoffs, grande final e o sobe/cai (zonas) — **tudo menos os
  controles de gestão**.
- Os controles de gestão passam a ser renderizados **condicionalmente por
  capacidade** (`podeGerir` = dono ou admin de liga), não mais como pré-condição
  da página: montar temporada, iniciar divisão, toggle de turno, console de fim
  de temporada (fluxo), botões de montar/avançar playoff, montar grande final, e
  os links "Equipe"/"Identidade".
- Os loaders de leitura deixam de aplicar o gate de capacidade e passam a confiar
  na **RLS como fronteira de visibilidade** (liga `ativa` = pública; `arquivada` =
  só a equipe). `getSeason` passa a devolver os dados + uma flag `podeGerir` (em
  vez de `null` para não-gestor). A autorização de ESCRITA permanece intacta
  (Server Actions checam `podeGerir` diretamente + RLS de escrita).
- As páginas irmãs de gestão (`/cores`, `/equipe`), que hoje dependem do `null`
  de `getSeason` para 404, ganham um gate próprio explícito (`!podeGerir →
  notFound`) — a autorização migra do loader para o limite de cada página.
- **Navegação**: a página de torneio de uma divisão ganha um link "Ver liga"
  (pirâmide-mãe) — hoje não há caminho do jogador da divisão até a liga.

## Capabilities

### Modified Capabilities
- `league-pyramid`: a página da temporada passa a servir **leitura para qualquer
  logado**, com gestão gateada por capacidade; a visibilidade fica a cargo da RLS.

### New Capabilities
<!-- Nenhuma. -->

## Impact

- **Código de aplicação**: `src/features/league/data/getSeason.ts` (retorna flag
  `podeGerir`, deixa de retornar null por capacidade),
  `getDivisionStandings.ts` / `getPlayoffs.ts` / `getGrandeFinal.ts` (removem o
  gate `podeVerBastidores`, confiam na RLS), `src/app/dashboard/ligas/[id]/page.tsx`
  (renderização condicional), `.../[id]/cores/page.tsx` e `.../[id]/equipe/page.tsx`
  (gate próprio `!podeGerir → notFound`), painéis de gestão que precisam esconder
  botões mantendo a leitura (`PlayoffsPanel`, `GrandeFinalPanel`), e a página de
  torneio de divisão (link para a liga).
- **Banco de dados**: **nenhum**. A RLS já permite a leitura; DDL não é tocada.
- **Dependências**: nenhuma.
- **Segurança**: a fronteira de leitura passa a ser a RLS (já existente e
  testada); a de escrita continua no app-layer (`podeGerir` nas actions) + RLS de
  escrita (`pode_gerir_competition`). Nenhum segredo de gestão é exposto ao
  não-gestor (a página não renderiza códigos/convites/telefones; o payload de
  `getSeason` é só config/divisões/identidades).
