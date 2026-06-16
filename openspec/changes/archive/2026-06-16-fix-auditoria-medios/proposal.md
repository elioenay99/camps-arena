# Proposal — fix-auditoria-medios

## Why

A auditoria multi-agente de 2026-06-15 (`auditoria-goliseu`, 28 achados confirmados por verificação
adversarial) deu o app como SAUDÁVEL (0 crítico/0 alto), mas isolou **5 achados MÉDIOS** — os de maior
impacto real hoje. Três são de acessibilidade (conformidade WCAG em caminhos críticos de um app mobile-
first), um é dívida de tipos num caminho de mutação crítico (W.O.), e um é carga desnecessária no Postgres
na página central da pirâmide. Todos têm fix de baixo risco e solução conhecida; nenhum muda contrato de
produto — são correções de CONFORMIDADE e HIGIENE.

## What Changes

Correções pontuais, sem mudar comportamento de produto observável. Mantém RSC-first, gates verdes e
validação visual nos 2 temas + 390px.

1. **a11y — erro por campo nos forms** (WCAG 3.3.1/1.3.1): associar programaticamente a mensagem de erro
   de CADA campo ao input (`id` no erro + `aria-describedby` no input + `role=alert`/`aria-live`) nos 8+
   forms manuais (Login/Signup/Profile/Forgot/Change/Update/MatchCreate/Tournament) e no `ColorField`.
   Preferir o componente `Form`/`FormField`/`FormMessage` de `ui/form.tsx` quando já aplicável; senão,
   atributos manuais consistentes. NÃO alterar validação/lógica.
2. **tipos — status de W.O.**: declarar `WoRequestStatus = 'pendente'|'aceito'|'recusado'` e usar nas 3
   projeções (Row/Insert/Update) de `match_wo_requests` em `database.types.ts`, restaurando o guard de
   compilação em `wo.ts`. Remover `eh_co_participante` do bloco `Functions` (RPC não-chamável após o revoke).
3. **a11y — vencedor da chave** (WCAG 1.4.1): indicação NÃO-cromática do lado que avançou no `BracketView`
   (ícone + `sr-only "vencedor"`), mantendo a cor como reforço — o placar não desambigua em agregado/W.O.
4. **a11y — alvos de toque**: elevar para >=40px os botões de AÇÃO IRREVERSÍVEL no mobile (W.O./expulsar/
   encerrar) nos call-sites (`WoButtons`, `MatchStatusButton`, `SlotInviteButtons`, `InviteControls` e o
   header do dashboard), garantindo espaçamento. NÃO inflar `button.tsx` base (preserva botões pequenos
   legítimos).
5. **perf — página da liga**: eliminar o re-fetch N+2 de `league_boundaries` e os matches relidos por dois
   caminhos em `dashboard/ligas/[id]` — enriquecer `getSeason` e/ou envolver `getDivisionStandings`/
   `getGrandeFinal`/`getPlayoffs` em React `cache()`, SEM mudar a classificação por usuário (dono vs não-dono).

## Capabilities

Nenhuma nova e nenhum requisito de produto alterado. São correções de conformidade (a11y já exigida pelas
specs vigentes: "WCAG AA", "alvos adequados ao celular"), type-safety e performance interna.
