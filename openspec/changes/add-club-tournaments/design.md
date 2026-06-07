# Design — add-club-tournaments

## Context

Inversão do modelo de participação: vagas de CLUBE (tournament_slots) no
lugar de pessoas (participants) nos formatos competitivos. Mapeamento
completo do impacto feito em 2026-06-07: motores são agnósticos (string[]
de ids opacos); a reescrita concentra-se em schema/RLS/RPCs/actions/
fetchers/UI. Lições herdadas que CONTINUAM valendo: código de convite mora
FORA de tabela publicamente legível; propriedade por FILTRO (resposta única
sem oráculo); UPDATE atômico filtrado como serialização de corrida;
`.select()` confirma escrita; defesa em profundidade (action + RLS +
trigger).

## Goals / Non-Goals

**Goals:**

- Vaga = clube: disputa estável por construção; técnico substituível a
  qualquer momento sem tocar partidas.
- Convite por vaga com aceite atômico; clube órfão gerido pelo adm.
- Formatos competitivos iniciam SEM exigir técnicos (o torneio é dos clubes).

**Non-Goals:**

- Rodada ativa / fechamento / W.O. (change seguinte, depende deste).
- Migrar dados existentes (pré-produção; torneios de teste não-avulsos são
  limpos na seção manual).
- Mudar o formato avulso (continua pessoa-cêntrico, com participants).
- Multi-membro por clube (um técnico por vaga; elenco fica para o futuro).

## Decisions

### D1 — `tournament_slots`: vaga é o clube; técnico é metadado anulável

```sql
create table tournament_slots (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments on delete cascade,
  team_id       uuid not null references teams on delete restrict,
  user_id       uuid references users on delete set null,
  created_at    timestamptz not null default now(),
  constraint slots_team_unico_no_torneio unique (tournament_id, team_id)
);
create unique index slots_um_clube_por_tecnico
  on tournament_slots (tournament_id, user_id) where user_id is not null;
```

`team_id NOT NULL` (a vaga É um clube — produto). `user_id` SET NULL ao
apagar a conta: o torneio sobrevive com vaga órfã (hoje o CASCADE de
participants apagava a participação — upgrade de robustez). RESTRICT em
teams é teórico (cache nunca deleta) mas explicita a dependência.

### D2 — matches: `vaga_1/vaga_2` para competitivos; `participante_1/2` só avulso

Colunas novas FK `tournament_slots` (DELETE RESTRICT — partida não perde o
lado; a vaga é imutável pós-rascunho de toda forma). CHECK
`matches_lado_vaga_ou_user`: `(participante_1 IS NULL AND participante_2 IS
NULL) OR (vaga_1 IS NULL AND vaga_2 IS NULL)` — uma partida usa UM dos
pares. Bye na chave: `vaga_2 NULL` com `vaga_1` preenchida (espelho do
modelo atual). `time_1/time_2` (clube por partida) ficam SÓ para avulso —
no competitivo o clube vem da vaga. Índice novo `matches_liga_par_unico_vaga`
UNIQUE (tournament_id, rodada, vaga_1, vaga_2) WHERE rodada IS NOT NULL
(o antigo por participante morre junto com partidas competitivas por user).
`lock_match_relations` passa a travar também `vaga_1/vaga_2`.
*Alternativa rejeitada — manter participante_1/2 sincronizado com o técnico
da vaga*: dupla fonte de verdade e UPDATE em massa de partidas a cada troca
de técnico (exatamente o que o modelo novo elimina).

### D3 — Convite POR VAGA com aceite atômico; válido com torneio ATIVO

`slot_invites (slot_id PK → tournament_slots CASCADE, code text UNIQUE,
created_at)`; policies só do dono (segredo fora de tabela legível — lição).
`aceitar_convite_vaga(codigo)` SECURITY DEFINER: exige sessão; code → vaga;
torneio NÃO encerrado; então `UPDATE tournament_slots SET user_id =
auth.uid() WHERE id = vaga AND user_id IS NULL` — 0 linhas = vaga ocupada
(ou corrida perdida): mensagem honesta. O unique parcial (D1) barra quem já
comanda outro clube no torneio (exceção 23505 → mensagem). DIFERENÇA
deliberada do modelo antigo: o convite NÃO exige rascunho — substituição no
meio do torneio é o requisito central. `info_convite_vaga(codigo)` devolve
título/clube/status/ja_tem_vaga para a página `/convite/[codigo]`, que tenta
o RPC de vaga e faz fallback ao RPC antigo (avulso) — mesma rota pública.

### D4 — Ciclo da vaga: esvaziar é livre; atribuir só por consentimento

- DESISTIR (técnico): `UPDATE ... SET user_id = NULL WHERE id = vaga AND
  user_id = auth.uid()` (action + policy: técnico só ESVAZIA a própria).
- EXPULSAR (dono): mesmo UPDATE filtrado por dono do torneio (policy WITH
  CHECK `user_id IS NULL` — dono só esvazia, nunca atribui terceiro).
- ASSUMIR: somente via `aceitar_convite_vaga` (consentimento por link) OU o
  DONO assumindo vaga vazia PARA SI (action `assumirVagaComoDono` lê o code
  próprio e usa o mesmo RPC — caminho único de atribuição).
- Sem congelamento: tudo válido em rascunho E ativo (encerrado trava).
- VAGAS (clubes) editáveis só em RASCUNHO: INSERT/DELETE de slots e troca de
  team_id bloqueados fora dele (policies + trigger `lock_slot_relations`
  travando team_id/tournament_id como defesa extra). Pós-rascunho a
  geometria pertence à disputa gerada.

### D5 — Iniciar formatos sobre slots; pré-checagens de pessoas morrem

`iniciarTorneio`/`iniciarMataMata`/`iniciarTorneioGrupos`/`avancarFase`/
`gerarMataMataDosGrupos` passam a montar `string[]` de SLOT IDs (ordenação
por code-point preservada; promote-first dos grupos intacto). A policy de
INSERT de matches valida que cada vaga informada PERTENCE ao torneio (troca
do EXISTS em participants por EXISTS em tournament_slots). A pré-checagem
"semeados em participants" morre — vagas existem por construção. Mínimo de
2 vagas para iniciar (sem exigir técnico).

### D6 — Display: o lado é o CLUBE; técnico é subtítulo

Fetchers embedam `vaga_1:tournament_slots(id, team:teams(nome, escudo_url),
tecnico:users(id, nome, celular, avatar))` (embed aninhado PostgREST).
`nomeDoLado` competitivo = nome do clube; técnico aparece como detalhe
("téc. Fulano" / "sem técnico"). StandingsTable/BracketView/MatchCard/modal
exibem escudo+clube; partidas avulsas seguem exibindo pessoas. Convocação
wa.me: celular do TÉCNICO da vaga adversária (gate continua: só quem joga).
PII inalterada em natureza (celular de técnico ≈ celular de participante).

### D7 — "Minhas partidas" do dashboard: duas consultas

Partidas avulsas onde `auth.uid() ∈ participante_1/2` + partidas
competitivas cujas vagas têm `user_id = auth.uid()` (subselect nos ids das
minhas vagas). Duas queries paralelas mescladas por created_at — `.or()`
sobre embed é frágil no PostgREST; duas viagens explícitas são mais simples
e indexáveis.

### D8 — Avulso intocado; participants reduz de escopo

`participants`/`tournament_invites`/`aceitar_convite`/`info_convite` seguem
EXCLUSIVOS do formato avulso. A policy de DELETE de participants volta a ser
simples (o congelamento por formato com chave morre — formatos competitivos
não usam participants). `eh_participante(t_id)` passa a: participa via
participants OU comanda vaga no torneio (mantém visibilidade de torneio
privado para técnicos).

### D9 — Limpeza dos dados de teste na seção manual

Decisão do usuário: dados descartáveis. A seção 13 instrui `DELETE FROM
tournaments WHERE formato <> 'avulso'` ANTES das mudanças estruturais
(cascade limpa partidas/participants/invites) — evita torneios competitivos
órfãos de vaga quebrando a UI nova.

## Riscos / Trade-offs

- **[2 modelos coexistem em matches]** → mitigado por CHECK de exclusão
  mútua + formato do torneio como discriminador; o avulso é caminho
  congelado (sem evolução).
- **[Aceite de convite com torneio ativo]** → desejado (substituição); o
  risco de "estranho entra no meio" é controlado pelo link por vaga ser
  segredo do dono (regenerável).
- **[Embed aninhado em 2 níveis]** → PostgREST suporta; testes do fetcher
  pinam o shape.
- **[Dono só esvazia vaga]** → expulsar+convidar de novo cobre "trocar
  técnico"; atribuição direta sem consentimento fica explicitamente fora.

## Migration Plan

Seção 13 das pendências, em UM Run (sem enum novo): limpeza de teste (D9) →
tabelas novas + policies + RPCs + colunas/CHECK/índice de matches + trigger
+ `eh_participante` + ajustes de policies de matches. Rollback documentado.

## Open Questions

Nenhuma — decisões de produto fechadas com o usuário em 2026-06-07.
