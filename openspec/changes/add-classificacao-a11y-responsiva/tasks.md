# Tasks — add-classificacao-a11y-responsiva

## 0. Baseline

- [ ] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test`.
  Registrar a contagem verde (verde final = igual ao baseline, zero regressão).

## 1. Funções puras da densidade (`standings/densidade.ts` NOVO)

- [ ] 1.1 Extrair `deriveModoInicial(viewportMobile: boolean): Modo`
  (`viewportMobile ? 'caber' : 'rolar'`) e
  `deriveCompacto(viewportMobile: boolean, modo: Modo): boolean`
  (`viewportMobile && modo === 'caber'`). Sem IO, sem `matchMedia`.
- [ ] 1.2 Tipo `Modo = 'rolar' | 'caber'` compartilhado (mover de
  `ClassificacaoResponsiva` para o módulo puro, reexportado).

## 2. `ClassificacaoResponsiva` — estado, contexto e coordenação CSS×JS

- [ ] 2.1 Estado `{ modo, viewportMobile }` (inicial determinístico `'rolar'`/`false`
  → `compacto=false`, casando SSR + esqueleto). Efeito pós-hidratação: lê
  `matchMedia('(max-width: 640px)')` (guard jsdom) → `viewportMobile`; lê
  `localStorage` → `modo` (ou `deriveModoInicial(viewportMobile)` sem preferência);
  assina `change` do MQL para reconciliar em resize/rotação.
- [ ] 2.2 `compacto = deriveCompacto(viewportMobile, modo)`. Publicar no wrapper
  `group/standings`: `data-modo={modo}` (tipografia, como hoje) + NOVO
  `data-compacto={compacto}`; e prover `StandingsModoContext` com `{ compacto }`
  ao redor de `{children}` (Provider client envolvendo Server Components).
- [ ] 2.3 **Escopo E11:** botões de modo "Rolar"/"Caber tudo"
  (`ClassificacaoResponsiva.tsx:79-104`, hoje ~28-30px) → alvo ≥44px no mobile
  (compacto em `md`), foco visível.
- [ ] 2.4 Barra de toggle (`ml-auto`) alinhada ao conteúdo no container mais
  largo do desktop (não "fugir" para a borda).

## 3. `StandingsTable` — disclosure, `expansivel`, a11y de linha

- [ ] 3.1 Prop `expansivel?: boolean` (default `false`). Só a standings-page passa
  (torneios/[id], ligas/[id], copas/edicao). Consumidores crus (`LandingShowcase`,
  `GrandeFinalPanel`, `DestinoPill`, `TemporadaTimeline`, `MatchCard`, copas) NÃO
  passam → `<tr>` RSC atual, sem `<button>` por linha.
- [ ] 3.2 **`StandingsRow` (`"use client"`, NOVO):** por linha, `useState(expandido)`;
  retorna Fragment com principal + detalhe. Recebe os dados da linha por props
  serializáveis (RSC projeta). Consome `StandingsModoContext` (`compacto`).
- [ ] 3.3 **Gatilho (E12):** `<button aria-expanded aria-controls={detalheId}>`
  (chevron) DENTRO da célula de cabeçalho da linha; renderizado só quando
  `compacto` (render condicional por JS, não CSS). Alvo ≥44px no mobile, foco
  visível, na ordem de tabulação.
- [ ] 3.4 **Linha de detalhe:** `<tr id={detalheId}><td colSpan={N}>` com N
  DINÂMICO = `COLUNAS.length + (temForma ? 1 : 0)`; renderizada só quando
  `compacto && expandido`. Stats como pares rótulo→valor explícitos ("Vitórias: N",
  "Empates: N", "Derrotas: N", "Gols pró: N", "Gols contra: N").
- [ ] 3.5 **Ocultar secundárias no mobile:** V/E/D/GP/GC + coluna Forma passam a
  `group-data-[compacto=true]/standings:hidden` (a Forma muda de `modo=caber` para
  `compacto` — respeita a regra dura: desktop-caber não oculta).
- [ ] 3.6 **Row-header = NOME (nit E1) + zona `sr-only` (E1/E2):** a célula do NOME
  vira `<th scope="row">` com `font-normal text-left` (reset do UA); a de posição
  continua `<td>`. Injetar UMA vez por linha, nessa célula, um
  `<span class="sr-only">` com a zona reusando os booleanos existentes e os rótulos
  da legenda ("Zona de acesso"/"Zona de rebaixamento"/"Playoff de acesso"/"Playout"/
  "Playoff"). Sem ramo visual novo.

## 4. Responsividade — largura do desktop (F1)

- [ ] 4.1 A view de classificação usa container mais largo no desktop (aproveita a
  largura ociosa; colunas completas / divisões lado a lado quando couber), sem
  afetar o mobile nem criar rolagem horizontal do corpo da página.

## 5. Tap targets ≥44px restantes (`design-system`)

- [ ] 5.1 `RoundPager.tsx`: setas `size="icon-sm"` (~54-63, 84-93) e o `<select>`
  (~66-81) → alvo ≥44px no mobile, recuando à densidade atual em `md`.
- [ ] 5.2 Botões de AÇÃO IRREVERSÍVEL: como o requisito modificado eleva o piso a
  44px, o override `min-h-10` (40px) sobe para `min-h-11` (44px) em TODOS os loci
  (não só W.O./encerrar/editar placar, mas também convites, lifecycle, expulsar
  membro, ações de copa, sair, compartilhar) — alinha ao padrão 44px do primitivo
  (`h-11 md:h-8`). `min-w-10` pareado vira `min-w-11`. Atualizar comentários "40px".
- [ ] 5.3 `color-field.tsx`: swatch `h-9` (~53) → `h-11 md:h-9`; link "limpar"
  (~73-79) ganha alvo ≥44px no mobile (min-h/padding).
- [ ] 5.4 `EmptyActiveMatches.tsx:89-93`: link "Ver meus torneios"
  (`buttonVariants size="sm"`) → alvo ≥44px no mobile (compacto no desktop).

## 6. Contraste AA + foco (`design-system`)

- [ ] 6.1 **`--destructive` no DARK (sistêmico):** clarear para `#ff8888` (≈5.6:1
  como `text-destructive` sobre card). Verificado que NÃO há `bg-destructive`
  sólido → sem regressão de fundo. Validar o par `text-destructive` sobre
  `bg-destructive/10-20` ≥4.5. **Badge "D" da coluna Forma** (`FormaBadges.tsx:12`,
  único fundo destrutivo com texto claro): `text-white` → `text-primary-foreground`
  (foreground adaptativo) para não regredir nos dois temas. LIGHT (#c81a2a) não muda.
- [ ] 6.2 **Badge admin (dark E light):** `TeamRoleBadge.tsx:23-27` (admin) →
  texto `text-foreground`, mantendo `border-primary/30` + ícone `text-primary`.
  Árbitro/moderador inalterados (já passam). `ChampionshipBadge` decorativo
  (`aria-hidden`) fica como está (registrado).
- [ ] 6.3 **Anel de foco ≥3:1:** `button.tsx:8` `ring-ring/50` → `ring-ring`;
  `button.tsx:20` `ring-destructive/20` → `ring-destructive`; `RoundPager.tsx:71`
  `<select>` `focus-visible:ring-ring/50` → `ring-ring`; `globals.css:156`
  `outline-ring/50` GLOBAL → `outline-ring`. Manter `ring-3`/espessura. Validar
  ≥3:1 nos dois temas.
- [ ] 6.4 `muted-foreground` nas superfícies TOCADAS por esta change: validar ≥4.5;
  corrigir localmente se algum locus tocado falhar. `muted-foreground` sobre
  `secondary` FORA do escopo desta change fica de-escopado (dívida pré-existente,
  registrado).
- [ ] 6.5 Conferir ratios AA/AAA-foco nos DOIS temas para cada par tocado (dark E
  light) — nada regride no claro.

## 7. Esqueleto / FOUC (E15)

- [ ] 7.1 `StandingsTableSkeleton` NÃO é alterado: o render inicial determinístico
  da tabela é "rolar"/`compacto=false` (todas as colunas) e casa o esqueleto — sem
  flash no boundary. Registrar a exclusão explícita no diff/PR; o reflow
  pós-hidratação no mobile (ocultar colunas + chevron) é aceito.

## 8. Testes

- [ ] 8.1 Puras: `deriveModoInicial` (mobile→'caber', desktop→'rolar') e
  `deriveCompacto` (só `mobile && 'caber'` → true; desktop-caber → false).
- [ ] 8.2 `StandingsRow` por ESTADO (sem matchMedia): sob Provider `compacto=true`
  → `<button aria-expanded="false">` presente; acionar → `aria-expanded="true"` +
  células de detalhe (pares rótulo→valor) presentes; recolher volta. Sob
  `compacto=false` → nenhum chevron e nenhuma linha de detalhe.
- [ ] 8.3 A11y da tabela: célula do NOME é `<th scope="row">`; linha em zona expõe
  o `sr-only` correto (rótulos da legenda); tabela sem zona não emite anúncio mas
  mantém `scope="row"`; `expansivel=false` não renderiza `StandingsRow`/chevron.
- [ ] 8.4 `colSpan` do detalhe acompanha `temPromedio`/`temForma` (N dinâmico).
- [ ] 8.5 Badges: admin com `text-foreground` + rótulo textual; árbitro/moderador
  inalterados.

## 9. Gate de qualidade

- [ ] 9.1 `openspec validate add-classificacao-a11y-responsiva --strict` = valid.
- [ ] 9.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (igual ao
  baseline — zero regressão).
- [ ] 9.3 Validação VISUAL 390px + desktop, dark E light (zona sem cor, tap
  targets, foco, disclosure/expandir, largura desktop, sem flash de esqueleto). —
  DEFERIDO ao orquestrador (validação ao vivo).
