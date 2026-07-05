# Tasks — rename-formato-liga-nomenclatura

## 0. Baseline
- [ ] 0.1 Baseline HEAD: `pnpm typecheck && pnpm lint && pnpm test` verdes.
  Verde final = igual ao baseline (zero regressão).

## 1. (D1) Rótulo/wording do formato `liga`
- [ ] 1.1 `src/features/tournament/formatoMeta.ts`: em `liga: { label: "Liga", ... }`
  trocar `label` para `"Pontos corridos"`. Manter `desc`
  ("Todos contra todos, com tabela") e a chave `liga` intactas.
- [ ] 1.2 `src/features/tournament/components/IniciarTorneioPanel.tsx:37`:
  `formatoLabel="Liga"` → `formatoLabel="Pontos corridos"`.
- [ ] 1.3 `IniciarTorneioPanel.tsx:48`: "A liga aceita no máximo …" →
  "O torneio aceita no máximo …". `:52`: "A liga precisa de pelo menos 2 clubes."
  → "É preciso pelo menos 2 clubes." Ajustar o comentário `:15` ("dono de liga")
  se ele nomear o formato.
- [ ] 1.4 `src/features/tournament/components/IniciarTorneioButton.tsx:59`:
  toast "Liga iniciada! Tabela gerada." → "Torneio iniciado! Tabela gerada.".
- [ ] 1.5 `src/app/dashboard/torneios/page.tsx:74`: "Crie uma liga, mata-mata ou
  fase de grupos …" → "Crie um torneio de pontos corridos, mata-mata ou fase de
  grupos …".
- [ ] 1.6 `src/app/dashboard/partidas/nova/page.tsx:65`: "(em liga, a tabela é
  gerada …)" → "(em pontos corridos, a tabela é gerada …)".
- [ ] 1.7 Conferir que NENHUM valor de domínio mudou — só texto exibido.

## 2. (D2) Aba de navegação → "Pirâmides" + cópia da vitrine
- [ ] 2.1 `src/app/dashboard/layout.tsx`: item
  `{ href: "/dashboard/ligas", rotulo: "Ligas" }` → `rotulo: "Pirâmides"`.
  A rota `href` NÃO muda.
- [ ] 2.2 `src/app/dashboard/ligas/page.tsx`: CONFERIR que `metadata.title`
  ("Pirâmides · Goliseu") e o H1 ("Pirâmides") já estão corretos. Só ajustar se
  houver "Liga/Ligas" sobrando; caso contrário, não mexer.
- [ ] 2.3 `src/app/dashboard/explorar/page.tsx:99`: "Ligas e torneios públicos da
  comunidade." → "Pirâmides e torneios públicos da comunidade.".
- [ ] 2.4 `explorar/page.tsx:69`: "Quando um organizador listar uma liga ou
  torneio na vitrine …" → "… listar uma pirâmide ou torneio …". (Confirmado:
  `tipo === "liga"` = a pirâmide.) NÃO tocar `:21` "Liga de divisões".

## 3. (D3) Back-link "Ver liga" → "Ver pirâmide"
- [ ] 3.1 `src/app/dashboard/torneios/[id]/page.tsx`: no `<Link>` para
  `/dashboard/ligas/${ligaSeasonId}`, texto "Ver liga" → "Ver pirâmide". Rota e
  `prefetch={false}` permanecem. Atualizar comentários `:767` e `:780` que citam
  "Ver liga".

## 4. Fronteira do valor de domínio (garantir intocado)
- [ ] 4.1 Confirmar visualmente que o valor `'liga'` segue intacto em
  `supabase/schema.sql` (enum), `src/lib/supabase/database.types.ts`
  (`TournamentFormat`), `src/schema/tournamentSchema.ts` (`z.enum` como opção;
  `default` = `'avulso'`) e nas CHAVES de `FORMATO_META`. Nenhuma edição aqui.

## 5. Testes (detector real = build/typecheck/test; grep é só auxiliar)
- [ ] 5.1 `src/app/dashboard/torneios/[id]/page.test.tsx`: trocar os asserts de
  back-link `/ver liga/i` por `/ver pirâmide/i` — em `:415`, `:427` e também na
  asserção NEGATIVA `:436` (`queryByRole … /ver liga/i … toBeNull` → `/ver
  pirâmide/i`, senão deixa de guardar o caso avulso). Renomear os títulos
  describe/it que citam "Ver liga" (`:404`, `:408`, `:419`, `:433`).
- [ ] 5.2 `src/features/nav/components/NavLinks.test.tsx:39`: a fixture local
  `{ rotulo: "Ligas" }` é GENÉRICA do componente (não o label real da nav).
  Trocar para "Pirâmides" (inócuo). Escolha documentada: mantém a fixture longe
  de virar critério de grep.
- [ ] 5.3 Cobertura NOVA para D1/D2 (Chip "Pontos corridos", aba "Pirâmides") é
  OPCIONAL — não exigida; nenhum teste atual asserta o rótulo antigo do formato.
- [ ] 5.4 (Auxiliar, não critério) grep case-insensitive só em source
  (excluindo `*.test.*`): `grep -rni 'ver liga\|"liga"\|rotulo: "ligas"'
  src --include='*.ts' --include='*.tsx' -l | grep -v '.test.'` — usar para
  achar resíduo, NUNCA como prova de verde. A prova de verde é o gate abaixo.

## 6. Gate
- [ ] 6.1 `openspec validate rename-formato-liga-nomenclatura --strict` = VALID.
- [ ] 6.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes
  (igual ao baseline).
