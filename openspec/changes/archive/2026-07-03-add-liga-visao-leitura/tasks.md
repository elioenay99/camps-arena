## 1. Loaders: confiar na RLS + expor capacidade

- [x] 1.1 `getSeason.ts`: remover o gate `if (!podeGerir(...)) return null`; calcular `podeGerir` e incluí-lo no retorno (`TemporadaCompleta & { podeGerir: boolean }`). Continuar retornando `null` só quando a season é invisível/inexistente (query vazia via RLS). Atualizar o comentário do cabeçalho (não é mais "página de gestão").
- [x] 1.2 `getDivisionStandings.ts`: remover o gate `podeVerBastidores`; confiar na RLS. Preservar o retorno `null` para divisão sem torneio/invisível.
- [x] 1.3 `getPlayoffs.ts`: remover o gate `podeVerBastidores`; confiar na RLS (estado vazio quando invisível/sem playoff).
- [x] 1.4 `getGrandeFinal.ts`: remover o gate `podeVerBastidores`; confiar na RLS.
- [x] 1.5 Ajustar o tipo `TemporadaCompleta` (novo campo `podeGerir`) e todos os call-sites que desestruturam o retorno.

## 2. Página da liga: leitura para qualquer logado + gestão gateada

- [x] 2.1 `ligas/[id]/page.tsx`: manter `redirect(login)` se `!user`; usar `temporada.podeGerir` para renderizar condicionalmente os controles de gestão.
- [x] 2.2 Esconder quando `!podeGerir`: `MontarTemporadaButton`, `IniciarDivisaoButton`, `TurnoDivisaoControl`, `FluxoTemporadaPanel` (inteiro), links "Equipe" e "Identidade" do header.
- [x] 2.3 Estados vazios read-only para o leitor: card "Temporada ainda não montada" (sem botão) e "Divisão ainda não iniciada." (sem botão), preservando o card de gestão para o gestor.
- [x] 2.4 `PlayoffsPanel` e `GrandeFinalPanel`: aceitar prop `podeGerir` e esconder só os botões de ação (montar/avançar/montar-final), mantendo o `BracketView`/resultado visível ao leitor.
- [x] 2.5 **Threading até o `DivisaoCard`** (ressalva 1): o subcomponente `DivisaoCard` (`page.tsx` ~349-507) hoje embute controles de gestão sem receber capacidade. Passar `podeGerir` ao `DivisaoCard` e ocultar ao leitor: `TurnoDivisaoControl` (~491), os botões do `GrandeFinalPanel` (~470, via prop `podeGerir`) e `IniciarDivisaoButton` (~499) — mantendo o conteúdo de leitura (bracket/classificação). Vazamento cosmético de botões (as actions já gateiam server-side), mas obrigatório.

## 3. Páginas irmãs de gestão: gate próprio

- [x] 3.1 `ligas/[id]/cores/page.tsx`: adicionar `if (!temporada.podeGerir) notFound()` (deixou de vir do `null` de `getSeason`).
- [x] 3.2 `ligas/[id]/equipe/page.tsx`: idem `if (!temporada.podeGerir) notFound()`.

## 4. Navegação divisão → liga

- [x] 4.1 Na página de torneio de divisão (`torneios/[id]/page.tsx`, quando `ehDivisao`), resolver o `season_id` da divisão (lookup em `league_division_seasons` por `tournament_id`/`tournament_id_clausura`) e adicionar link "Ver liga" → `/dashboard/ligas/[season_id]`. Omitir se não resolver.

## 5. Testes

- [x] 5.1 Unit dos loaders (mock Supabase): liga **ativa** → gestor, não-gestor logado e não-membro logado TODOS recebem dados; `getSeason` retorna `podeGerir` correto por caso.
- [x] 5.2 Unit: liga **arquivada** + não-equipe → `getSeason` retorna `null` (RLS não entrega linhas).
- [x] 5.3 Testes da `page.tsx`: gestor vê botões de gestão; não-gestor vê classificação/playoffs/grande final SEM nenhum botão/link de gestão; não-logado → redirect para login.
- [x] 5.4 Testes de `cores`/`equipe`: não-gestor → `notFound`.
- [x] 5.5 Suíte completa verde (`pnpm test`) sem regressão vs. baseline.

## 6. Qualidade e validação

- [x] 6.1 Gate mecânico: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — todos verdes.
- [x] 6.1b **Verificação MECÂNICA obrigatória (ressalva 2):** o diff DEVE conter os dois novos gates `if (!temporada.podeGerir) notFound()` — em `/cores/page.tsx` E `/equipe/page.tsx`. `/equipe` carrega `member_invites` (getConvitesMembro) e renderiza AddMemberSearch/MemberInviteCards; esquecer o gate = vazamento REAL de convites/gestão de equipe ao relaxar o loader. Conferir com `grep -n "podeGerir) notFound\|!temporada.podeGerir" src/app/dashboard/ligas/\[id\]/cores/page.tsx src/app/dashboard/ligas/\[id\]/equipe/page.tsx` (dois hits).
- [ ] 6.2 Validação visual mobile **390px** (conta de teste não-gestor): abrir a liga de um camp existente → ver classificação/rodadas sem 404 e sem controles de gestão; abrir como gestor → controles presentes. (ORQUESTRADOR — specialist não dirige browser)
- [ ] 6.3 Revisão adversarial por workflow do diff (foco: nada de gestão vaza ao leitor; nenhuma regressão de autz de escrita). (ORQUESTRADOR — specialist não spawna workflow)
- [x] 6.4 `openspec validate add-liga-visao-leitura --strict` = valid.
