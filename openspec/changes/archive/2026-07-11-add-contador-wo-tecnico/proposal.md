## Why

Hoje o organizador de uma competição não tem visibilidade de quais técnicos estão
faltando de forma reincidente. O W.O. já é registrado por partida (`matches.wo`,
`wo_duplo`, `wo_vencedor`) e o histórico de técnicos por vaga já existe
(`coach_tenures`), mas não há nenhuma agregação disciplinar: o ADM não vê "este
técnico levou 3 W.O. seguidos" e não tem uma ação de moderação proporcional. O
resultado é abandono silencioso de vagas que degrada o campeonato sem que o
organizador consiga agir de forma estruturada.

Esta change entrega uma **escada disciplinar automática de W.O. SEGUIDOS por
técnico, por competição** (torneio), com PERDÃO e EXPULSÃO manuais quando o técnico
estoura o limite. A regra reusa a máquina de atribuição de partidas ao técnico já
consolidada (`coach_tenures` + janela meio-aberta, igual a `partidaNaJanela`), então
o escopo herda liga + mata-mata derivado + copa-por-clube automaticamente.

**Decisões de produto (travadas pelo dono — não reabrir):**
1. **Escopo = por competição** (o torneio é onde partidas e W.O. vivem). Tudo por
   `tournament_id` + técnico (`user_id`).
2. **Contagem = W.O. SEGUIDOS (streak consecutivo), NÃO acumulado.**
3. **Escada automática:** cada W.O.-derrota sofrido soma ao streak; com streak 1 ou 2,
   o técnico estar PRESENTE numa partida (jogou de verdade OU venceu por W.O.) dispara
   PERDÃO AUTOMÁTICO (zera). A partir de streak 3, o perdão automático TRAVA — estar
   presente não zera mais; só o ADM resolve.
4. **Ações do ADM (aparecem com streak ≥ 3):** PERDOAR (zera o streak, mantém o
   técnico) ou EXPULSAR (remove o técnico da vaga; o próximo começa do zero).
5. **Duplo W.O. conta como sofrido pros DOIS** técnicos ausentes (é um W.O.-derrota
   para ambos).
6. **Perdão só zera o streak.** NÃO reabre partida, NÃO mexe em `matches`, NÃO altera
   standings. Baseline persistido, não-destrutivo, auditável.
7. **W.O.-VITÓRIA (o adversário faltou, o técnico venceu) = o técnico está PRESENTE →
   trata como "jogou"** para o auto-perdão (streak < 3 zera; ≥ 3 trava). NÃO é neutro.

## What Changes

- **Módulo puro de regra em TS** (`src/features/standings/woStreak.ts`): função
  `calcularStreakWo(eventos)` que consome eventos ordenados por rodada
  (`{rodada, tipo: 'wo_loss'|'wo_win'|'jogou', perdoado}`) e devolve o streak
  corrente conforme a escada. Constante `LIMITE_WO_SEGUIDOS = 3` para gatear
  UI/ações. É a FONTE DA VERDADE da regra; testada exaustivo em Vitest.
- **Nova tabela `public.wo_perdoes`** (baseline de perdão persistido, por
  `match_id + user_id`): registra que um W.O.-derrota foi perdoado por um ADM,
  sem tocar `matches`. RLS SELECT-only (gated por
  `pode_ver_bastidores_torneio`/`pode_gerir_torneio`), escrita exclusiva via RPC
  `SECURITY DEFINER`, REVOKE explícito espelhando `coach_tenures`.
- **Helper interno `wo_sofridos_do_tecnico(p_tournament_id, p_user_id)`**
  (`sql stable security definer`): devolve os `match_id` de W.O.-derrota do técnico
  em TODAS as tenures dele no torneio (janela meio-aberta). REVOKE total (só as
  DEFINER owner chamam).
- **RPC de leitura gated `sequencia_disciplina_torneio(p_tournament_id)`**
  (`plpgsql stable security definer`, gate INTERNO `pode_gerir_torneio` → `NAO_AUTORIZADO`):
  para cada técnico com tenure ABERTA no torneio, devolve os eventos disciplinares
  (`user_id, slot_id, rodada, tipo, perdoado`) ordenados por rodada, para o fetcher
  computar o streak com `calcularStreakWo`.
- **RPC de escrita `perdoar_wo_tecnico(p_tournament_id, p_user_id)`**
  (`plpgsql security definer`, gate `pode_gerir_torneio`): insere em `wo_perdoes`
  todos os W.O.-derrota atuais do técnico, IDEMPOTENTE (`on conflict do nothing`),
  retorna quantos perdões novos criou. NÃO toca `matches`/standings.
- **RPC de escrita `expulsar_tecnico_wo(p_tournament_id, p_slot_id)`**
  (`plpgsql security definer`, gate `pode_gerir_torneio`): esvazia
  `tournament_slots.user_id` da vaga (amarrada ao torneio contra tamper), disparando
  o fecho da tenure (`fn_registrar_coach_tenure`). Retorna linhas afetadas. Expulsão
  disciplinar liberada a dono + admins — NÃO reusa a `expulsarTecnico` dono-only.
- **Camada TS:** fetcher `getDisciplinaWoTorneio` (agrupa a RPC por técnico, calcula
  streak, resolve nome/avatar, devolve só `streak > 0` ordenado desc); actions em
  `src/actions/wo.ts`: `perdoarWoTecnico` (pré-check `podeGerir` + RPC +
  `revalidatePath`) e `expulsarTecnicoWo(tournamentId, slotId)` (pré-check `podeGerir`
  + RPC `expulsar_tecnico_wo` + `revalidatePath`). A `expulsarTecnico` dono-only
  (`src/actions/slots.ts:177`) fica INTACTA para os outros fluxos.
- **UI:** nova seção "Disciplina — W.O. seguidos" na ÁREA DE ADMINISTRAÇÃO da página
  do torneio (`src/app/dashboard/torneios/[id]/page.tsx`, gate `podeGerir`), RSC-first;
  botões client `PerdoarWoButton`/`ExpulsarTecnicoButton` (confirmação inline em dois
  cliques, padrão do repo, + `sonner`)
  aparecem juntos só quando `streak >= LIMITE_WO_SEGUIDOS` (ambos gated por `podeGerir`,
  sem flag `ehDono`). O toast de sucesso do Perdoar diz "Contagem zerada" — NÃO expõe
  o número de perdões (a materialização varre todas as tenures do técnico e pode
  exceder o streak visível).
- **Tipos gerados** (`src/lib/supabase/database.types.ts`): `wo_perdoes` Row/Insert/
  Update + as QUATRO funções novas no bloco de Functions.

## Capabilities

### Added Capabilities
- `wo-discipline`: escada disciplinar automática de W.O. seguidos por técnico, por
  competição — contagem de streak consecutivo, perdão automático até o limite,
  perdão/expulsão manuais do ADM acima do limite.

### Modified Capabilities
- `data-model`: nova tabela `wo_perdoes` (baseline de perdão por `match_id + user_id`)
  e as funções de derivação/perdão/expulsão disciplinar.
- `row-level-security`: `wo_perdoes` SELECT-only gated por bastidores/gestão do
  torneio (sem SELECT para anon), escrita exclusiva via RPC `SECURITY DEFINER`,
  REVOKE explícito; a expulsão disciplinar via RPC gated `pode_gerir_torneio`.

## Impact

- **Banco de dados (DDL — mostrado antes de aplicar, REGRA 4):** aditivo e
  idempotente em `supabase/schema.sql` (fonte de verdade) +
  `openspec/changes/add-contador-wo-tecnico/ddl.sql` (recorte para PROD). Cria a
  tabela `wo_perdoes` (+ índices + RLS + REVOKE de escrita E de select-anon), o
  helper interno `wo_sofridos_do_tecnico`, e as RPCs
  `sequencia_disciplina_torneio`, `perdoar_wo_tecnico` e `expulsar_tecnico_wo`. ZERO
  alteração em `matches`, `coach_tenures`, standings ou policies existentes; a
  `expulsarTecnico` dono-only permanece intacta. O agente NÃO aplica DDL em PROD (mostra o `ddl.sql` ao dono;
  aplicação via MCP após aprovação).
- **Código de aplicação:** `src/features/standings/woStreak.ts` (novo, puro);
  `src/features/league/data/getDisciplinaWoTorneio.ts` (novo fetcher);
  `src/actions/wo.ts` (novas actions `perdoarWoTecnico` e `expulsarTecnicoWo`);
  seção RSC `DisciplinaWoTecnicos.tsx` + folhas client dos botões;
  `src/app/dashboard/torneios/[id]/page.tsx` (fetch + render gated `podeGerir`);
  `src/lib/supabase/database.types.ts` (tipos regenerados).
- **Segurança:** escrita de perdão e expulsão só via RPC gated
  (`pode_gerir_torneio`); leitura da sequência idem; helper interno sem EXECUTE
  público; a tabela `wo_perdoes` sem policy de escrita e sem SELECT para anon (defesa
  em profundidade + REVOKE explícito). A `expulsar_tecnico_wo` é DEFINER (ignora a RLS
  de `tournament_slots`), então o gate `pode_gerir_torneio` é a defesa; a
  `expulsarTecnico` dono-only original fica inalterada.
- **Dependências:** nenhuma nova (sonner já no projeto; a confirmação inline em dois
  cliques reusa o padrão de `TournamentLifecycleButtons`, sem novo componente).
- **Testes:**
  - **Vitest:** `woStreak.test.ts` EXAUSTIVO (o coração da regra); action
    `perdoarWoTecnico` (mock supabase, estilo `wo.test.ts`); mapeamento do fetcher
    se houver lógica pura.
  - **pgTAP REAL (`pnpm test:rls`, OBRIGATÓRIO):** classificação
    wo_loss/wo_win/jogou + perdoado + janela meio-aberta + só tenures abertas; gate
    (não-admin/anon → erro, dono/admin → funciona); idempotência do perdão; RLS
    (anon/authenticated não inserem direto → 42501; helper não executável por
    authenticated); duplo W.O. como wo_loss pros dois técnicos.
