# Tarefas

## 1. Banco (escrever em `supabase/schema.sql`; NÃO aplicar)

- [x] 1.1 Coluna `league_competitors.escudo_url` (nullable, aditiva, idempotente).
- [x] 1.2 CHECK `league_competitors_escudo_url_dominio` espelhando a de `teams`, com host
      ANCORADO (sem ramo `media.api-sports.io`).
- [x] 1.3 Função `public.pode_gerir_escudo_custom(text)` — plpgsql, `stable`,
      `security definer`, `search_path = ''`; regex ANTES do cast; grants
      (`revoke from public`, `grant to authenticated`).
- [x] 1.4 Policies de Storage `"escudos custom insert gestor"` e
      `"escudos custom delete gestor"` (prefixo `custom/` apenas). Policy existente do
      catálogo intocada.
- [x] 1.5 `info_convite_vaga`: `coalesce(lc.escudo_url, tm.escudo_url)` via `left join
      league_competitors lc on lc.id = ts.competitor_id`. Assinatura inalterada; grants
      re-emitidos.
- [x] 1.6 Bloco de DDL isolado e comentado, pronto para o orquestrador revisar com o dono.

## 2. Base compartilhada

- [x] 2.1 `src/lib/escudoEfetivo.ts` — helper puro `escudoEfetivo(custom, doCatalogo)` +
      teste.
- [x] 2.2 `src/lib/escudoCustom.ts` — `subirEscudoCustom` / `removerEscudoCustom`,
      reusando `sniffTipoImagem` de `src/lib/evidence.ts`; allowlist `png|webp`;
      `contentType` do tipo DETECTADO; path `custom/<competitor_id>/<uuid>.<ext>` + teste.
- [x] 2.3 `src/lib/imagemCliente.ts` — redução para 256×256 em canvas (webp com fallback
      png), sem preservar EXIF.
- [x] 2.4 Zod dos parâmetros da action. Ficou INLINE em `src/actions/escudoCompetidor.ts`
      (dois `z.uuid()`), não em `src/schema/`: não há shape de formulário a compartilhar —
      o arquivo de schema seria indireção sem consumidor. O conteúdo do arquivo é
      validado por bytes em `src/lib/escudoCustom.ts`, não por Zod.
- [x] 2.5 `src/lib/supabase/database.types.ts` — `escudo_url` em `league_competitors`
      (Row/Insert/Update).

## 3. Server Actions

- [x] 3.1 `src/actions/escudoCompetidor.ts` — `definirEscudoCompetidor` e
      `removerEscudoCompetidor`: parâmetros `unknown` + Zod, `podeGerir` como pré-check,
      RLS como backstop, `.update(...).select("id")` vazio ⇒ mesma mensagem de "não
      encontrado ou sem acesso", limpeza do arquivo órfão quando a RLS barra, remoção
      best-effort do arquivo anterior, `revalidatePath` explícito.
- [x] 3.2 Testes da action: sucesso, sem auth, sem capacidade GERIR, arquivo inválido,
      RLS barrando (limpeza do upload), remoção do override.

## 4. Fetchers (embed de um hop + `escudoEfetivo`)

- [x] 4.1 `src/features/standings/data/getTournamentClassificacao.ts` (v1/v2 + mapa de
      escudos).
- [x] 4.2 `src/features/league/data/getDivisionClassificacaoCombinada.ts`
- [x] 4.3 `src/features/league/data/getSeason.ts` (raiz em `league_competitors`) — expõe
      também se há override, para a UI.
- [x] 4.4 `src/features/league/data/getMuralha.ts`
- [x] 4.5 `src/features/league/data/getArtilharia.ts`
- [x] 4.6 `src/features/league/data/getTecnicoProfile.ts`
- [x] 4.7 `src/features/league/data/getRivaisDoCompetidor.ts`
- [x] 4.8 `src/features/league/data/getCompetitorProfile.ts`
- [x] 4.9 `src/features/match/data/getPartidasDaRodada.ts`
- [x] 4.10 `src/features/match/data/getActiveMatches.ts`
- [x] 4.11 `src/features/match/data/getPartidaParaImagem.ts`
- [x] 4.12 `src/features/tournament/data/getVagasDoTorneio.ts`
- [x] 4.13 `src/features/cup/data/getEdicao.ts` (embed em `cup_entries`)
- [x] 4.14 `src/app/dashboard/ligas/[id]/temporada/[seasonId]/imagem/route.tsx`

## 5. UI

- [x] 5.1 `src/features/league/components/CompetitorCrestForm.tsx` — folha client:
      arquivo → preview → salvar/remover, `useTransition`, `sonner`, `router.refresh()`,
      alvos ≥44px, sem `shrink-0` no cluster.
- [x] 5.2 Seção "Escudos dos clubes" em `src/app/dashboard/ligas/[id]/cores/page.tsx`
      (sem rota nova; o gate `!podeGerir → notFound` já existe).
- [x] 5.3 Teste do formulário (jsdom).

## 6. Gate (leve — máquina de 16GB)

- [x] 6.1 `pnpm typecheck`
- [x] 6.2 `pnpm lint`
- [x] 6.3 Subset afetado com `--maxWorkers=2`
- [ ] 6.4 Commit pt-BR, Conventional Commits, sem coautoria de IA, SEM push.
