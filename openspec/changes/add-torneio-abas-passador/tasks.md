# Tasks — add-torneio-abas-passador

## 1. Base de abas
- [x] 1.1 Criar `src/components/ui/tabs.tsx` (wrapper de `@radix-ui/react-tabs`: Tabs/TabsList/
      TabsTrigger/TabsContent) no design system; TabsList rolável no mobile (390px)
- [x] 1.2 Criar `src/features/tournament/components/TournamentTabs.tsx` (client): recebe
      `abas: {value,label,content}[]` + `padrao`; troca client-side; aba inativa pode desmontar

## 2. Passador por rodada
- [x] 2.1 Criar `src/features/match/components/RoundPager.tsx` (client): ‹ anterior · select
      "Rodada N de M" · próxima ›, `rodadaInicial`, `Fechar rodada` na rodada ativa; aria-live
- [x] 2.2 `OpenMatchesList`: ramo competitivo passa a montar nós por rodada e renderizar via
      `RoundPager` (cabeçalho/Fechar migram ao passador); avulso plano intocado; PII no servidor
- [x] 2.3 `MatchHistoryList`: com `rodada` → agrupa por rodada + `RoundPager` (abre na última);
      sem rodada → lista plana atual

## 3. Composição da página em abas
- [x] 3.1 `page.tsx`: extrair os conteúdos das seções para nós; montar `abas` dinâmicas
      (Classificação padrão; Partidas; Rodadas; Vagas) só com conteúdo; cabeçalho + Administração
      fora das abas; preservar TODOS os gates/condicionais e os empty-states

## 4. Testes
- [x] 4.1 `TournamentTabs`: renderiza só abas com conteúdo, padrão correto, troca de aba
- [x] 4.2 `RoundPager`: abre na rodada inicial; anterior/próxima; pular via select; rodada única
      (+ regressão: ancora ao número da rodada quando a lista encolhe)
- [x] 4.3 `OpenMatchesList`: competitivo paginado (uma rodada por vez); avulso plano preservado;
      `Fechar rodada` aparece só na rodada ativa p/ quem encerra
- [x] 4.4 `MatchHistoryList`: paginado por rodada; sem rodada continua plano

## 5. Gates
- [x] 5.1 `pnpm typecheck` verde
- [x] 5.2 `pnpm lint` verde
- [x] 5.3 `pnpm test` verde (suíte completa — 1303 testes)
- [x] 5.4 `pnpm build` verde
- [x] 5.5 Revisão adversarial do diff por workflow (0 must_fix; 2 should_fix + 1 nit corrigidos:
      passador ancorado ao nº da rodada, `aria-live` só no resumo, anel de foco `ring-inset`)
- [ ] 5.6 Validação ao vivo (390px): abas trocam, passador anda entre rodadas, Fechar rodada na
      ativa, avulso plano; sem regressão visual — PENDENTE (requer browser + login do dono)
