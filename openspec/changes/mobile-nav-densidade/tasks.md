# Tasks — mobile-nav-densidade

## 1. Contrato de altura da barra

- [x] 1.1 Declarar `--nav-inferior-faixa: 3.25rem` e
      `--nav-inferior-h: calc(var(--nav-inferior-faixa) + env(safe-area-inset-bottom))` em
      `:root` (`src/app/globals.css`), com comentário explicando por que são DUAS: o `body`
      já paga `env(safe-area-inset-bottom)`, então conteúdo em fluxo lê a faixa e quem mede
      da viewport (`fixed`/`sticky`) lê o total.

## 2. Parte A — barra de navegação inferior

- [x] 2.1 Criar `src/features/nav/components/BottomNav.tsx` (client): 4 destinos
      (Painel `/dashboard` exato, Torneios, Pirâmides, Explorar), ícone + rótulo textual,
      `aria-current="page"` por `usePathname`, alvo ≥44px, `prefetch={false}`.
- [x] 2.2 `id="nav-inferior"`, `fixed inset-x-0 bottom-0 z-40 sm:hidden`,
      `pb-[env(safe-area-inset-bottom)]`, fundo opaco + `border-t`.
- [x] 2.3 Renderizar em `src/app/dashboard/layout.tsx` e envolver `{children}` com
      `pb-[var(--nav-inferior-faixa)] sm:pb-0` — conteúdo em FLUXO lê a faixa, porque o
      `body` já paga o inset da área segura.
- [x] 2.4 Lista de destinos declarada DENTRO do componente (não por prop): ícones não
      atravessam a fronteira RSC (`fix-editar-placar-rsc`).

## 3. Parte A — conflito toast × barra

- [x] 3.1 Regra em `globals.css`, escopada por `body:has(#nav-inferior)` e por
      `@media (width < 40rem)`, sobrescrevendo `--offset-bottom` E `--mobile-offset-bottom`
      com `!important` (o sonner escreve as duas inline).
- [x] 3.2 Reescrever o comentário do `<Toaster>` em `src/app/layout.tsx`: a premissa
      "nenhuma tela tem barra fixa no rodapé" ficou falsa e não pode permanecer em produção.

## 4. Parte B — itens 1 e 2 (alto impacto)

- [x] 4.1 `EmptyActiveMatches.tsx`: CTA com `h-auto min-h-11 max-w-full whitespace-normal`.
- [x] 4.2 Varrer os demais CTAs longos do app e registrar quais foram conferidos.
- [x] 4.3 `DemoRibbon.tsx`: aviso curto ("Dados fictícios") abaixo de `sm:`, frase completa
      de `sm:` para cima; compactar padding e rótulos das ações no mobile.
- [x] 4.4 Confirmar que `src/features/demo/isolamento.test.ts` segue verde (sem import novo).

## 5. Parte B — itens 3 a 5

- [x] 5.1 `VagasSection.tsx`: URL crua e console de moderação recolhidos em `<details>`
      nativo; `CopyVagaLinkButton` preservado.
- [x] 5.2 `LeagueWizard.tsx`: barra `Anterior / Próximo` em
      `sticky bottom-[var(--nav-inferior-h)] sm:static`, com fundo opaco.
- [x] 5.3 `LeagueWizard.tsx` + `CupWizard.tsx`: rótulo do passo ATIVO visível no mobile
      ("Passo N de M · Rótulo") — mudança espelhada nos dois.

## 6. Parte B — itens 6 a 8

- [x] 6.1 `src/app/page.tsx`: `gap-10 px-4 py-10 sm:gap-16 sm:px-6 sm:py-16`.
- [x] 6.2 `SignupForm.tsx` e `ForgotPasswordForm.tsx`: sucesso preserva `role="status"`,
      mantém o texto da mensagem intacto e ganha ação "Ir para o login".
- [x] 6.3 `getVitrine.ts`: `.limit(60)` nas duas queries.

## 7. Testes

- [x] 7.1 Suíte nova `BottomNav.test.tsx`: 4 destinos com href real, estado ativo por
      rota (exato vs prefixo), rótulo textual presente, `prefetch={false}`.
- [x] 7.2 Teste de ausência da barra fora da subárvore autenticada (landing e `/demo`).
- [x] 7.3 `EmptyActiveMatches.test.tsx`: afirmar que o CTA longo não é `whitespace-nowrap`.
- [x] 7.4 Cobertura do estado de sucesso dos dois formulários (mensagem + ação seguinte;
      texto anti-enumeração inalterado).
- [x] 7.5 Atualizar testes irmãos afetados.

## 8. Gate leve (restrição de recursos)

- [x] 8.1 `pnpm typecheck`
- [x] 8.2 `pnpm lint`
- [x] 8.3 Subset afetado com `--maxWorkers=2` (sem suíte completa, sem build, sem browser)
- [x] 8.4 `openspec validate mobile-nav-densidade --strict`
- [x] 8.5 Commit pt-BR, Conventional Commits, sem coautoria de IA, SEM push
