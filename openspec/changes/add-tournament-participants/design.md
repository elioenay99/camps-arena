# Design: add-tournament-participants

## Context

O modelo atual não tem noção de "quem participa do torneio": `matches` aponta
direto para `users`, o dono escala qualquer usuário do app (fetcher
`getParticipantesDisponiveis` lista TODOS os users) e a RLS de
`tournaments`/`matches` só conhece dono e público. Duas limitações registradas
no archive de `add-match-creation` derivam disso. Padrões estabelecidos do
repo: Server Actions com defesa em profundidade (Zod → `auth.getUser()` →
propriedade por FILTRO sem oráculo → `.select()` confirmando escrita → RLS como
segunda barreira), DDL manual via `supabase/schema.sql` + seção em
`docs/pendencias-manuais.md`, mensagens pt-BR, testes vitest com mocks.

## Goals / Non-Goals

**Goals:**

- Participação consentida: ninguém vira participante sem ação própria (aceite
  pelo link); ninguém entra em partida nova sem ser participante.
- Descoberta: participante vê torneio privado de terceiro (página do torneio,
  dashboard, índice de torneios).
- Segredo do convite protegido por design (tabela própria + RLS de dono).
- Base para os formatos de torneio (liga/grupos/mata-mata geram partidas a
  partir de `participants`).

**Non-Goals:**

- Convite direto a usuário existente com notificação in-app (só link/código).
- Estado "pendente" de convite (o aceite é o uso do link; não há fila).
- Papéis além de dono/participante (co-organizador etc.).
- Retro-validação de partidas legadas (participantes fora da lista continuam
  válidos nas partidas já criadas — histórico).
- Limite de participantes por torneio (vem com os formatos).

## Decisions

### D1 — `participants` sem estado: linha = confirmado

`participants (tournament_id uuid, user_id uuid, created_at, PK composto, FKs
on delete cascade)`. Como o convite é por link e o aceite é a ação de usar o
link, não existe convite "pendente" persistido — elimina máquina de estados,
expiração e limpeza. Alternativa rejeitada: tabela com `status
pendente/aceito` — só faria sentido com convite direcionado a usuário, que
ficou fora do escopo.

### D2 — Código de convite em tabela separada (`tournament_invites`)

`tournament_invites (tournament_id uuid PK/FK cascade, code text unique,
created_at)`. O código NÃO pode ser coluna de `tournaments`: a policy
`tournaments_select_visivel` expõe torneios públicos a `anon`, e `select *`
vazaria o segredo — qualquer um entraria em qualquer torneio público sem
convite. RLS de `tournament_invites`: todas as operações só para o DONO do
torneio. O convidado nunca lê a tabela diretamente (D3). 1:1 (PK =
tournament_id): regenerar = UPDATE do code, invalidando o link antigo
atomicamente. Alternativa rejeitada: column-level GRANT em `tournaments` —
funciona, mas é invisível no schema.sql idempotente e fácil de quebrar em
manutenção.

### D3 — Aceite e preview via funções `SECURITY DEFINER` (RPC)

A RLS de INSERT de `participants` não consegue validar um segredo que não está
na linha inserida. Então:

- `aceitar_convite(codigo text)`: valida `auth.uid()` não nulo, código
  existente, torneio não-encerrado; `insert ... on conflict do nothing`;
  retorna o `tournament_id`. Erros com mensagens pt-BR via `raise exception`.
- `info_convite(codigo text)`: retorna `tournament_id, titulo, status,
  ja_participa` para a página `/convite/[codigo]` exibir o torneio antes do
  aceite — sem ela, torneio privado é invisível ao convidado até aceitar.

Ambas `security definer set search_path = ''`, espelhando
`lock_match_lifecycle`. Primeira vez que o app usa `supabase.rpc()`; é o
mecanismo correto para "validar segredo e agir além da própria RLS".
Alternativa rejeitada: client `service_role` na action — segredo de poder
total no processo web por causa de um caso pontual.

### D4 — Visibilidade por participante via `eh_participante()` (anti-recursão)

`tournaments_select_visivel` ganha `or public.eh_participante(id)`. A função é
`security definer` lendo `participants` SEM RLS — necessário porque policy de
`tournaments` referenciando `participants` cuja policy referencia `tournaments`
dispara "infinite recursion detected in policy" do Postgres. Cadeia resultante:
`participants` policy → `tournaments` policy → `eh_participante` (definer,
fim). `matches_select_visivel` usa a mesma função na subquery de tournaments.
Efeito colateral desejado: `getActiveMatches` (embed `tournaments!inner`) passa
a mostrar partidas de torneio privado onde sou participante — fecha a
limitação 1 sem mudar a query.

### D5 — INSERT do dono direto; demais via RPC

Policy `participants_insert_owner`: `with check (user_id = auth.uid() AND
exists(torneio meu))` — permite `createTournament` inserir o dono como
participante (decisão: dono entra automaticamente; pode sair). Convidados
entram só pela RPC (que bypassa RLS após validar o código). DELETE:
`participants_delete_self_or_owner` — o próprio sai, o dono remove. Sem
UPDATE (não há colunas mutáveis). SELECT: visível quando o torneio é visível
(`is_public` / dono / `eh_participante`) — necessário para listas e selects.

### D6 — `createTournament` em 3 escritas, falha recuperável

INSERT do torneio → INSERT do dono em `participants` → INSERT do invite (código
gerado server-side em `src/lib/invite-code.ts`: `crypto.getRandomValues`,
alfabeto base32 sem ambíguos, 16 chars, ~80 bits). Sem transação (PostgREST não
expõe); se a 2ª/3ª escrita falhar o torneio existe sem participante/convite —
recuperável na UI (dono usa "Participar" e "Gerar link"); a action reporta
sucesso parcial sem mentir. Torneios legados: mesma recuperação. Colisão de
código (unique): retry único com código novo, depois erro.

### D7 — Criação de partida por torneio (rota aninhada)

Selects de participante dependem do torneio escolhido; manter tudo numa página
exigiria client-side fetch. RSC-first: form em
`/dashboard/torneios/[id]/partidas/nova` (gated dono + torneio não-encerrado;
mesmo padrão `podeGerirPartidas`), selects restritos aos `participants` do
torneio + "Definir depois". `/dashboard/partidas/nova` vira seletor (lista de
links para a rota aninhada — navegação pura, zero JS), preservando o botão
existente do dashboard.
`createMatch` ganha validação: cada participante não-nulo deve estar em
`participants` do torneio (uma query `in`); policy
`matches_insert_tournament_owner` ganha a mesma cláusula (`participante_X is
null or exists(...)`) — segunda barreira.

### D8 — Página de convite pública com retorno seguro

`/convite/[codigo]`: deslogado → CTAs para `/login` e `/cadastro` com
`redirectTo=/convite/<codigo>` (sanitizado pelo `safe-redirect.ts` existente).
Logado → `info_convite`: inválido → mensagem única "Convite inválido ou
expirado" (sem oráculo de existência); já participante → link para o torneio;
senão → form action `aceitarConvite` → redirect para
`/dashboard/torneios/[id]`. Código na URL path (link compartilhável via
WhatsApp — público-alvo).

### D9 — Índice `/dashboard/torneios` (Organizo / Participo)

Sem isso, quem aceita convite não tem como reencontrar o torneio (hoje a única
entrada é o link no MatchCard). Página RSC simples: duas listas (criados por
mim; onde sou participante e não dono) com link para a página do torneio. Nav
ganha entrada "Torneios" (prefix match, padrão NavLinks existente).

## Risks / Trade-offs

- [Link vaza → entra quem não devia] → dono regenera o código (invalida o
  antigo) e remove o intruso; aceitável para o público do app (grupos de
  amigos).
- [3 escritas sem transação no createTournament] → estados parciais
  recuperáveis pela UI (D6); pior caso é torneio sem convite, nunca dado
  órfão inválido.
- [Funções SECURITY DEFINER ampliam superfície] → `search_path = ''`,
  validação de `auth.uid()`, sem SQL dinâmico; revisão adversarial focada
  nelas; não testáveis por unit (mocks) → checagens manuais na seção 8 das
  pendências (espelha a decisão do lifecycle).
- [Policies de SELECT com função por linha (custo)] → `eh_participante` é
  `language sql` STABLE, inline-ável, com índice no PK composto; volume do app
  é pequeno.
- [Remover participante não remove partidas dele] → decisão de produto
  (histórico fica); partidas em aberto com removido continuam editáveis por
  ele (ainda é `participante_X` da linha) — documentado; o dono pode encerrar.
- [Dependência da seção 8 manual] → sem DDL, criar torneio e página do torneio
  falham; pendência destacada em vermelho no relatório final e no
  `pendencias-manuais.md`.

## Migration Plan

1. `supabase/schema.sql` atualizado (fonte de verdade) + seção 8 em
   `docs/pendencias-manuais.md` com SQL pronto (tabelas, funções, policies,
   backfill: inserir donos atuais como participantes e gerar invites para
   torneios existentes — opcional, recuperável pela UI).
2. Código entra junto (app quebra sem a seção 8 apenas nos fluxos novos e em
   `createTournament`; fluxos existentes seguem).
3. Rollback: drop das 2 tabelas/3 funções e restauração das 3 policies
   anteriores (SQL de rollback incluído na seção 8).

## Open Questions

Nenhuma — decisões de produto resolvidas pelo usuário em 2026-06-05.
