## Why

O termo **"Liga"** colide na UI do Goliseu. Ele nomeia DUAS coisas distintas:

1. O **formato de torneio** `liga` (todos-contra-todos com tabela) — rótulo
   "Liga" em `FORMATO_META` E em várias cópias hardcoded de painéis/toasts/empty
   states.
2. As **pirâmides de divisões** (sobe/cai plurianual) — a tela de índice já se
   chama "Pirâmides" (H1 + `metadata.title`), mas a ABA de navegação ainda diz
   "Ligas", a página de uma divisão oferece um back-link "Ver liga", e a vitrine
   ("Explorar") descreve as pirâmides como "ligas".

Resultado: o usuário lê "Liga" e não sabe se o assunto é o formato pontos-corridos
ou a pirâmide de divisões. Esta change elimina a colisão trocando SÓ TEXTO
EXIBIDO — nenhum valor de domínio muda.

Correção de premissa da 1ª versão: `FORMATO_META` NÃO é fonte única do rótulo do
formato. O `IniciarTorneioPanel` passa `formatoLabel="Liga"` como literal, e
vários textos ("A liga aceita…", "Liga iniciada!", "Crie uma liga…", "em liga, a
tabela é gerada…") são cópia hardcoded. Todos entram no escopo de D1.

## What Changes

- **(D1) Formato `liga` → "Pontos corridos" (rótulo) / wording neutro de
  "torneio".** Onde o texto NOMEIA o formato, usar "Pontos corridos"; onde o
  texto apenas se refere ao torneio em andamento, usar wording neutro ("torneio")
  — o que soar mais idiomático em pt-BR, sempre removendo o "Liga/liga" ambíguo.
  O VALOR DE DOMÍNIO `'liga'` (enum do banco, `TournamentFormat`, `z.enum` do
  `tournamentSchema`, chaves de `FORMATO_META`) NÃO MUDA. Pontos:
  - `src/features/tournament/formatoMeta.ts` — `liga.label` "Liga" → "Pontos
    corridos" (mantém `desc` "Todos contra todos, com tabela").
  - `src/features/tournament/components/IniciarTorneioPanel.tsx:37` —
    `formatoLabel="Liga"` → `"Pontos corridos"`.
  - `IniciarTorneioPanel.tsx:48` e `:52` — "A liga aceita no máximo…" / "A liga
    precisa de pelo menos 2 clubes." → neutro ("O torneio aceita no máximo…" /
    "É preciso pelo menos 2 clubes."); ajustar o comentário `:15` ("dono de
    liga") se ele nomear o formato.
  - `IniciarTorneioButton.tsx:59` — toast "Liga iniciada! Tabela gerada." →
    "Torneio iniciado! Tabela gerada." (neutro).
  - `src/app/dashboard/torneios/page.tsx:74` — "Crie uma liga, mata-mata ou fase
    de grupos…" → "Crie um torneio de pontos corridos, mata-mata ou fase de
    grupos…".
  - `src/app/dashboard/partidas/nova/page.tsx:65` — "(em liga, a tabela é
    gerada…)" → "(em pontos corridos, a tabela é gerada…)".
  - Mensagens de ERRO user-facing (validação Zod + action) que nomeavam o
    formato de "liga", alinhadas ao painel neutro: `src/schema/tournamentSchema.ts`
    (as duas — "A liga aceita no máximo … clubes." e "… competidores.") e
    `src/actions/tournaments.ts` ("… participantes.") → "O torneio aceita no
    máximo …", preservando a interpolação `LIGA_MAX_PARTICIPANTES`. O `throw` do
    motor puro `gerarTabelaLiga.ts` (não user-facing) permanece fora.
- **(D2) Aba de navegação → "Pirâmides" + cópia coerente na vitrine.**
  - `src/app/dashboard/layout.tsx` — item de nav `rotulo: "Ligas"` → "Pirâmides"
    (a rota `/dashboard/ligas` NÃO muda). O H1 e o `metadata.title` da tela já
    dizem "Pirâmides" — só CONFERIR.
  - `src/app/dashboard/explorar/page.tsx:99` — "Ligas e torneios públicos da
    comunidade." → "Pirâmides e torneios públicos da comunidade.".
  - `explorar/page.tsx:69` — "Quando um organizador listar uma liga ou torneio na
    vitrine…" → "…listar uma pirâmide ou torneio…". (Confirmado: neste contexto
    `tipo === "liga"` É a pirâmide, não o formato.)
- **(D3) Back-link "Ver liga" → "Ver pirâmide".** Na página de um torneio que é
  divisão de pirâmide, o link para a temporada-mãe troca "Ver liga" por "Ver
  pirâmide"; comentários `page.tsx:767,780` acompanham. Rota
  (`/dashboard/ligas/[season_id]`) e comportamento inalterados.

## Fora de escopo (auditado — documentado com motivo)

- **`conquistas.ref_rotulo` "Liga — Temporada N"** (render em
  `getConquistasDoCompetidor.ts:74` via `row.ref_rotulo`): é **DADO PERSISTIDO**,
  materializado na criação da conquista. Trocar o texto exigiria backfill de
  dados no banco — fora do escopo desta change puramente de frontend. Fica como
  dívida/cleanup futuro.
- **`explorar/page.tsx:21` "Liga de divisões"** (rótulo do TIPO pirâmide na
  legenda do card): depois do rename do formato não há mais colisão; eventual
  troca para "Pirâmide de divisões" é decisão à parte, mantida fora daqui.

## Capabilities

### Modified Capabilities
- `league-format`: o rótulo de UI do formato `liga` (em `FORMATO_META` E nos
  painéis/toasts/empty states hardcoded) passa a ser "Pontos corridos" ou
  wording neutro de "torneio"; o valor de domínio `'liga'` permanece.
- `app-shell`: a seção de navegação das pirâmides passa a se chamar "Pirâmides"
  (antes "Ligas").
- `league-pyramid`: o back-link da divisão para a liga-mãe passa a ler "Ver
  pirâmide" (antes "Ver liga").
- `public-discovery`: a cópia da vitrine ("Explorar") passa a chamar as
  pirâmides de "pirâmides" (antes "ligas").

## Impact

- **Código de aplicação (só texto exibido):** os arquivos listados em D1/D2/D3
  acima. Nenhuma lógica, rota, action ou validação muda.
- **Fronteira NÃO tocada (valor de domínio `'liga'`):**
  `supabase/schema.sql` (enum), `src/lib/supabase/database.types.ts`
  (`TournamentFormat`), `src/schema/tournamentSchema.ts` (`z.enum` mantém o valor
  `'liga'` como opção válida; o `default` do formulário é `'avulso'` e também não
  muda), e as CHAVES de `FORMATO_META`.
- **Banco de dados:** nenhuma DDL. Nenhum valor persistido muda (inclusive
  `conquistas.ref_rotulo` fica como está — ver Fora de escopo).
- **Config:** nenhuma.
- **Testes:** o DETECTOR REAL da regressão é `pnpm typecheck` + `pnpm test` +
  `pnpm build` (grep é auxiliar, não critério). Asserts que fixam o texto ANTIGO
  do back-link ("Ver liga") em `torneios/[id]/page.test.tsx` são atualizados para
  "Ver pirâmide"; fixture genérica de `NavLinks.test.tsx` ajustada. Nenhum teste
  atual checa o rótulo "Liga" do formato (Chip) — cobertura nova para D1/D2 é
  opcional. Suíte segue verde.
