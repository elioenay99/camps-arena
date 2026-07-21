## Why

O dono quer trocar o escudo de um clube **dentro da liga dele** — hoje é impossível. O
`escudo_url` mora em `public.teams`, que é o **catálogo global** de clubes brasileiros
reais, compartilhado pelos 34 usuários e por todas as ligas. Editá-lo lá mudaria o escudo
do Atlético Mineiro para todo mundo.

Isto **não é correção de bug**. A investigação anterior já provou que `escudos/117.png`
responde 200, é PNG válido 150×150, e que o service worker faz bypass em `/_next/image`
(allowlist estrita) — foi falha transitória de rede no aparelho, e o fallback de iniciais
já foi blindado em `5edf7fd`. É uma feature de personalização.

Hoje são 40 clubes em uso, 9 ligas e **0 clubes compartilhados entre ligas** — mas o
catálogo é de clubes REAIS, então duas ligas usarem o mesmo clube é o caso esperado
conforme o app cresce. Por isso o override é **local por liga**, nunca global.

**Decisões travadas (o dono decidiu — não reabrir):**

1. **Escopo: override LOCAL por liga.** `public.teams` fica INTACTO.
2. **Origem: upload de arquivo próprio** (foto do celular ou arquivo do PC).
3. **Permissão: dono + admins da liga** — a capacidade GERIR que já existe.

## What Changes

**Onde mora o override.** `public.league_competitors` (`schema.sql:2086`) É a entidade
"clube dentro da pirâmide" — já tem `competition_id`, `team_id`, `rotulo` e
`holder_user_id`. Ganha **uma coluna** `escudo_url`. Sem tabela nova, sem tabela de
junção. O escudo efetivo passa a ser `coalesce(league_competitors.escudo_url,
teams.escudo_url)`.

**Como as ~14 superfícies resolvem o override — a decisão de arquitetura.**
`tournament_slots.competitor_id` (`schema.sql:2154`) já aponta para
`league_competitors`, e `cup_entries.competitor_id` (`schema.sql:4100`) também. Ou seja:
**toda vaga competitiva de liga já tem um ponteiro de UM HOP para a linha onde o override
vive.** Nenhum fetcher precisa derivar `competition_id` por
`league_division_seasons → league_seasons`, e nenhuma view nova é necessária. Cada fetcher
ganha um embed aninhado `competidor:league_competitors!<fk>( escudo_url )` no `select` que
já faz e aplica o mesmo helper puro. O `null` de `competitor_id` (torneio avulso/legado)
degrada exatamente para o comportamento de hoje. A alternativa (view SQL) foi avaliada e
**rejeitada** — o porquê está em `design.md`.

- **DDL (NÃO aplicada por esta change — bloco isolado no relatório):** coluna
  `league_competitors.escudo_url`; CHECK `league_competitors_escudo_url_dominio`
  espelhando a CHECK anti-SSRF de `teams` (`schema.sql:521-530`), com o host ANCORADO;
  função `public.pode_gerir_escudo_custom(text)` + duas policies de Storage para o prefixo
  `custom/`; `coalesce` no RPC `info_convite_vaga` (corpo, sem mudar a assinatura).
  Nenhuma policy de `league_competitors` muda: `league_competitors_update_owner`
  (`schema.sql:3805`) já resolve por `pode_gerir_competition`, que já é **dono + admin**.

- **NOVO `src/lib/escudoCustom.ts`** — upload/remoção no bucket `escudos` sob o prefixo
  `custom/<competitor_id>/<uuid>.<ext>`, reusando `sniffTipoImagem` de `src/lib/evidence.ts`
  (magic bytes) em vez de reescrever validação. Só `image/png` e `image/webp` — espelha o
  `allowed_mime_types` do bucket e mantém SVG fora (vetor de SVG-XSS).

- **NOVO `src/actions/escudoCompetidor.ts`** — Server Actions `definirEscudoCompetidor` e
  `removerEscudoCompetidor`, no padrão do projeto: parâmetros `unknown` + Zod,
  `podeGerir` como pré-check, RLS como backstop, `.update(...).select("id")` vazio =
  "não encontrado ou sem acesso" (sem oráculo), `revalidatePath` explícito.

- **NOVO `src/lib/imagemCliente.ts` + `CompetitorCrestForm.tsx`** — a folha client
  reduz a imagem escolhida para 256×256 em canvas ANTES do upload. Isso resolve três
  coisas de uma vez: cabe no `file_size_limit` de 256KB do bucket (foto de celular não
  cabe), normaliza qualquer formato de entrada para PNG/WEBP, e **elimina EXIF/GPS por
  construção** (o canvas re-encoda só os pixels).

- **UI: sem rota nova.** A seção "Escudos dos clubes" entra em
  `/dashboard/ligas/[id]/cores` — a página que o app já chama de **"Identidade"** no
  header da liga. Escolher arquivo → preview → Salvar → sonner; "Remover" volta ao escudo
  do catálogo. Mobile-first a 390px: alvos ≥44px, sem `shrink-0` no cluster de ações.

- **Fetchers alterados (14):** `getTournamentClassificacao`,
  `getDivisionClassificacaoCombinada`, `getSeason`, `getMuralha`, `getArtilharia`,
  `getTecnicoProfile`, `getRivaisDoCompetidor`, `getCompetitorProfile`,
  `getPartidasDaRodada`, `getActiveMatches`, `getPartidaParaImagem`,
  `getVagasDoTorneio`, `getEdicao` (copa) e a rota OG
  `ligas/[id]/temporada/[seasonId]/imagem/route.tsx`. Os dois últimos itens da lista do
  briefing (`getCompetitorProfile` e a rota OG de temporada) **não estavam nos 12** e
  foram incluídos: ambos desenham escudo em tela de liga.

- **Copa:** o override VALE na copa vinculada. `cup_entries.competitor_id` guarda a
  proveniência do competidor de liga; é o mesmo clube, do mesmo dono, dentro da mesma
  pirâmide. Documentado em `design.md`.

## Impact

- **Specs:** `league-pyramid` (ADDED — escudo personalizado por liga), `data-model`
  (MODIFIED — coluna + CHECK), `row-level-security` (ADDED — policies de Storage do
  prefixo `custom/`).
- **Banco:** DDL escrita em `supabase/schema.sql` e **NÃO aplicada** — o orquestrador
  mostra ao dono e aplica via MCP. `public.teams` intocado.
- **Intocados:** `proxy.ts`/middleware, `src/lib/escudos.ts` (o caminho determinístico
  `<external_id>.png` do catálogo continua imutável e write-once), a allowlist de host de
  `src/features/og/compartilhado.tsx` (o override vive no MESMO host do Storage, já
  confiável), `src/features/demo/*` (fixtures em memória, sem banco).
- **Risco:** médio. O raio é largo (14 fetchers) mas cada mudança é o mesmo embed de um
  hop + o mesmo helper puro; o risco real é **esquecer uma superfície** (escudo antigo
  persistindo em um canto) e **regressão em torneio avulso**, onde `competitor_id` é
  `null` — os dois cobertos por teste.
