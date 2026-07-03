# Design — vitrine pública + compartilhar

## Contexto e restrições

- A **RLS já é a fronteira de leitura** e já cobre a vitrine: `tournaments_select_visivel`
  libera SELECT quando `is_public OR created_by = auth.uid() OR eh_participante(id)
  OR pode_ver_bastidores_torneio(id)`; as `league_*_select_visivel` liberam a liga
  `ativa` (ou dono/bastidores). Ou seja, qualquer logado JÁ consegue ler as ligas
  ativas e os torneios públicos que a vitrine vai mostrar — `listada` **não é uma
  fronteira de visibilidade**, é um flag de PUBLICAÇÃO (opt-in) que estreita o que
  o loader exibe. Não há DDL de RLS a fazer.
- A fundação read-only já existe (`add-liga-visao-leitura`): a página da temporada
  (`/dashboard/ligas/[season_id]`) e a do torneio (`/dashboard/torneios/[id]`)
  servem leitura a qualquer logado com a gestão gateada por `podeGerir`. A
  página do torneio já resolve `ehDivisao` (via RPC `liga_do_torneio`) e o
  `ligaSeasonId` da divisão. A vitrine e os toggles se encaixam nessas superfícies.
- Padrão de compartilhar EXISTENTE (reuso): `CompartilharRodadaButton` /
  `CompartilharListaTimesButton` orquestram o gesto por `compartilharWhatsApp`
  (`src/lib/compartilharWhatsApp`) — Web Share no celular, copiar no desktop.

## Decisão 1 — Onde mora a flag `listada`

**Torneio**: coluna `listada` em `tournaments`. O toggle só aparece quando
`!ehDivisao` — uma divisão de pirâmide NUNCA se lista sozinha (ela chega ao
público pela liga-mãe). A divisão herda `is_public=true` da pirâmide, mas
`listada` fica `false` e sem UI para mudá-la.

**Liga**: coluna `listada` em `league_competitions` (a COMPETIÇÃO imortal, não a
`league_seasons`). O toggle na página da temporada escreve em
`temporada.competicao.id` — listar a liga lista a pirâmide inteira, coerente com o
fato de a vitrine linkar a temporada CORRENTE. `default false` nas duas tabelas =
opt-in real (nenhuma competição legada entra sem ação do dono).

## Decisão 2 — Sem RLS nova (leitura pública; escrita na própria linha)

- **Leitura**: a vitrine lê linhas que a RLS já entrega a qualquer logado (liga
  `ativa`, torneio `is_public`). `listada` é filtrado no `where` do loader, não
  por policy.
- **Escrita** (`update tournaments/league_competitions set listada = ...`): é um
  UPDATE na PRÓPRIA linha da competição — o mesmo caminho já usado para
  `is_public`/config, coberto pela policy de update do dono existente
  (`pode_gerir_*`). A Server Action ainda checa `podeGerir` (defesa em
  profundidade), então o toggle exige capacidade GERIR em DUAS camadas (app + RLS).

## Decisão 3 — O loader da vitrine EXCLUI divisões

Duas queries independentes (ligas e torneios), unidas e ordenadas por mais
recente (`created_at desc`):

- **Ligas**: `league_competitions` com `listada = true` AND `status = 'ativa'`,
  de qualquer usuário. Embute a temporada CORRENTE (maior `numero`) para resolver
  o link — mesmo padrão de `getCompetitions` (`league_seasons(id, numero)` →
  `max(numero)`). Sem temporada (não deveria ocorrer — a season 1 nasce com a
  pirâmide) → o card é omitido.
- **Torneios**: `tournaments` com `listada = true` AND `is_public = true`,
  EXCLUINDO divisões:
  ```
  not exists (
    select 1 from league_division_seasons lds
    where lds.tournament_id = t.id
       or lds.tournament_id_clausura = t.id
       or lds.final_tournament_id = t.id
  )
  ```
  Belt-and-suspenders: mesmo que uma divisão tivesse `listada=true` (impossível
  pela UI, mas o `not exists` blinda contra escrita fora de banda), ela NUNCA
  aparece como card avulso. Divisões chegam ao público pelo card da liga-mãe.

O card (RSC) reusa `ChampionshipBadge`/tema (cores do campeonato), com título,
badge de formato, status (pílula) e o nome do dono. Link → visão read-only:
`/dashboard/ligas/[season_id]` (liga, season corrente) ou
`/dashboard/torneios/[id]` (torneio). Estado vazio:
"Nenhuma competição pública ainda."

## Decisão 4 — Resolução do `season_id` no link da liga

`league_competitions` não tem `season_id`; a rota da temporada é `[season_id]`.
Reusa-se o padrão do índice de ligas (`getCompetitions`): embutir
`league_seasons(id, numero)` e escolher a de MAIOR `numero` = temporada corrente
(a "ponta" da cadeia). O card linka `/dashboard/ligas/${seasonAtualId}`.

## Decisão 5 — Botão "Compartilhar" (só link canônico, reuso do padrão)

A Peça 3 compartilha SÓ o link canônico da página (sem imagem — diferente da
rodada, que baixa um PNG). Um novo componente client leve
(`CompartilharCompetitionButton`) monta a URL ABSOLUTA a partir do path canônico
(`window.location.origin` + path — o Web Share exige URL absoluta, resolvida no
cliente, como o `CompartilharListaTimesButton` já faz) e chama a MESMA
orquestração `compartilharWhatsApp({ texto, title })` SEM `getFile`. Renderizado
só quando `podeGerir` nas duas páginas. Liga → `/dashboard/ligas/[season_id]`;
torneio → `/dashboard/torneios/[id]`.

## Migração (DDL para o ORQUESTRADOR aplicar via MCP)

> O specialist **não** aplica DDL. Este é o SQL exato a aplicar no PROD (após
> aprovação do dono, mostrando o SQL — REGRA 4). Aditivo e idempotente, no mesmo
> estilo de `is_public`. Deve também ser refletido em `supabase/schema.sql`
> (fonte de verdade) junto às definições de `tournaments` e `league_competitions`.

```sql
-- add-vitrine-publica-e-compartilhar — opt-in de vitrine pública.
-- Aditivo e idempotente. default false: NENHUMA competição existente entra na
-- vitrine sem o dono optar (opt-in real; diferente de is_public, que é default
-- true para preservar a visibilidade das competições já semeadas).
alter table public.tournaments
  add column if not exists listada boolean not null default false;

alter table public.league_competitions
  add column if not exists listada boolean not null default false;

-- Índices parciais (opcionais) — a vitrine filtra listada=true e ordena por
-- created_at desc. O partial index cobre só as poucas linhas listadas.
create index if not exists tournaments_listada_idx
  on public.tournaments (created_at desc)
  where listada;

create index if not exists league_competitions_listada_idx
  on public.league_competitions (created_at desc)
  where listada;
```

Reflexo em `database.types.ts` (no MESMO PR, para o build não depender do DB):
adicionar `listada: boolean` em `Row` e `listada?: boolean` em `Insert`/`Update`
de `tournaments` e `league_competitions`.

## Edge cases

- **Divisão não é listável**: toggle escondido quando `ehDivisao`; e o loader da
  vitrine exclui divisões pelo `not exists`. Uma divisão nunca vira card avulso.
- **Vitrine vazia**: nenhuma competição `listada` → estado vazio "Nenhuma
  competição pública ainda." (sem erro).
- **Liga arquivada sai da vitrine**: o loader filtra `status = 'ativa'`; ao
  arquivar, a liga some da vitrine (a RLS também deixa de entregá-la ao não-dono).
- **Torneio que perde o público some**: o loader exige `is_public = true` AND
  `listada = true`; desmarcar qualquer um remove o card. Um torneio `listada` que
  vira privado (`is_public=false`) não aparece.
- **Toggle só para gestor**: o toggle não é renderizado a `!podeGerir`; a action
  rejeita `!podeGerir`; a RLS de update do dono é a barreira final.
- **Link exige login**: `/dashboard/explorar` faz `redirect(/login?redirectTo=...)`
  quando `!user` (como as demais páginas do dashboard); as páginas-alvo (liga/
  torneio) também exigem login.

## Fora de escopo

- Vitrine anônima (deslogada) — decisão de produto é exigir login, como o resto
  do dashboard.
- Busca/filtro/paginação na vitrine — v1 lista tudo ordenado por recência.
- Copas (`cup_competitions`) na vitrine — só ligas e torneios nesta entrega.
- Qualquer mudança de RLS ou no motor de standings/montagem.
