# Design — proposta de resultado com foto de evidência (rev. pós-gate)

## Contexto verificado (código atual)

- `updateMatchScore` (`src/actions/match.ts:73`): autoriza `ehJogadorDaPartida` (participante avulso
  OU técnico de vaga competitiva, `match.ts:46-56`); escreve só `placar_1/2`. NÃO encerra.
- `updateMatchTeams` (`match.ts:332-411`): autoriza `ehJogadorDaPartida`; o UPDATE de `time_1/2`
  DEPENDE da policy `matches_update_participant` (`matches_update_tournament_owner` só cobre arbitrar).
- `encerrarPartida` (`match.ts:699`) delega a `mudarStatusComoDono` (`match.ts:422`, NÃO exportada),
  que refaz auth/fetch e valida; fecha com o placar CORRENTE, dispara `varrerOrfaosDaRodada` e valida
  mata-mata. Trigger `valida_resultado_mata_mata` (`schema.sql:602-666`) faz **RAISE EXCEPTION** ao
  encerrar com EMPATE em jogo único/agregado.
- W.O.: `solicitarWO` (`wo.ts:261`) insere em `match_wo_requests`; `responderWO` (`wo.ts:351`);
  `match_wo_requests_select` (`schema.sql:1599-1605`) entrega a linha ao SOLICITANTE ou a quem arbitra
  (NÃO ao adversário); sem policy de DELETE (histórico imutável, `1607-1609`).
- Capacidades: `pode_arbitrar_torneio` (RPC, chamável em policy). Storage: só `avatars` (público,
  pasta por uid; upload validado na ACTION — `profile.ts:78-101`). NÃO há service_role em runtime
  (`env.ts:11-12`: chave é administrativa/CLI, fora do runtime Next). A rota OG usa client AUTENTICADO.
- UI: o técnico de vaga edita placar SÓ no `MatchScoreModalConnected` dentro do `MatchCard`
  (`/dashboard`, `getActiveMatches`); a página do torneio (`OpenMatchesList`) não tem esse modal p/
  competitivo. `getActiveMatches.ts:192` NÃO retorna capacidade por partida.

## Decisões

### D1 — Tabela `match_score_proposals`
```sql
create table public.match_score_proposals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  submetido_por uuid not null references public.users(id) on delete cascade,
  placar_1 integer not null check (placar_1 between 0 and 99),
  placar_2 integer not null check (placar_2 between 0 and 99),
  foto_path text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada')),
  motivo text,
  created_at timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references public.users(id)
);
create unique index match_score_proposals_uma_pendente
  on public.match_score_proposals (match_id, submetido_por) where status = 'pendente';
create index match_score_proposals_match on public.match_score_proposals (match_id);
```

### D2 — `match_wo_requests` += `foto_path text` (NULLABLE, opcional)
Visibilidade da foto de W.O. = a MESMA da solicitação (`match_wo_requests_select`): **solicitante +
aprovador** (decisão consciente — NÃO o adversário; o placar é que é visto pelos 2 jogadores). A rota
de evidência (D6) reusa a RLS da tabela de origem, então isso sai de graça.

### D3 — RLS de `match_score_proposals` (com JOIN a matches)
- **INSERT**: `submetido_por = auth.uid()` E EXISTS em `matches m JOIN tournament_slots s` onde
  `s.id in (m.vaga_1, m.vaga_2) and s.user_id = auth.uid()` e `m.id = match_id` e `m.liberada_em <= now()`
  e `m.status <> 'encerrada'`. (Espelha `match_wo_requests_insert_tecnico:1581-1594` + gate `liberada_em`.)
- **SELECT**: `pode_arbitrar_torneio(m.tournament_id)` OU é jogador (`s.user_id=auth.uid()` em vaga_1/2).
- **UPDATE**: só via o RPC (D5, definer). Sem policy de UPDATE p/ `authenticated` (a action de aprovar
  usa o RPC; nada de UPDATE direto da tabela pela sessão).
- **DELETE**: NENHUMA (histórico imutável, como W.O.). O reenvio NÃO apaga: ver D5 (o RPC/insert trata).

### D4 — Bucket `match_evidence` (privado) com limites no próprio bucket
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('match_evidence','match_evidence', false, 5242880,
        array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
```
Caminho: `<uid>/<match_id>/<rand>.<ext>` — **construído pela ACTION** (não pelo client).
Storage RLS:
- **INSERT/UPDATE/DELETE**: dono da pasta — `(storage.foldername(name))[1] = auth.uid()::text`.
- **SELECT**: dono da pasta OU autorizado pela partida embutida no path:
  `(storage.foldername(name))[1] = auth.uid()::text` OR `((storage.foldername(name))[2] ~
   '^[0-9a-f-]{36}$' and exists (select 1 from public.matches m
   where m.id = ((storage.foldername(name))[2])::uuid and (pode_arbitrar_torneio(m.tournament_id)
   or exists (select 1 from tournament_slots s where s.id in (m.vaga_1,m.vaga_2) and s.user_id=auth.uid()))))`.
  → guarda de FORMATO uuid antes do `::uuid` (não lança em nome legado/malformado); a leitura usa o
  **client da SESSÃO** (sem service_role); só vê quem arbitra/joga.

### D5 — RPC `aprovar_proposta_placar(p_proposal_id)` — SECURITY DEFINER, atômico
plpgsql (precedente: `montar_copa`/`aceitar_convite_vaga`). Numa única transação:
1. Auth: `pode_arbitrar_torneio(match.tournament_id)` da proposta; senão RAISE (mapeado p/ erro).
2. Carrega proposta `pendente` + partida `<> 'encerrada'` (FOR UPDATE).
3. **UM ÚNICO** `update matches set placar_1=p1, placar_2=p2, status='encerrada' where id=match_id
   and status<>'encerrada'` → o trigger `valida_resultado_mata_mata` valida o CONJUNTO e dá **rollback
   de tudo** se inválido (empate em mata-mata) — elimina o "placar fantasma".
4. `update match_score_proposals set status='aprovada', resolvido_em=now(), resolvido_por=v_uid where id=p_proposal_id`.
5. `update match_score_proposals set status='rejeitada', motivo='substituída (partida encerrada)',
   resolvido_em=now(), resolvido_por=v_uid where match_id=... and status='pendente'` (set-based →
   fecha a janela de reenvio concorrente e a corrida de 2 aprovadores).
A **varredura de órfãos** (`varrerOrfaosDaRodada`) roda na ACTION, best-effort, DEPOIS do RPC (como
hoje em `encerrarPartida`; secundária ao encerramento). `rejeitar_proposta_placar` pode ser action
simples (UPDATE via uma policy de UPDATE restrita a arbitrar) OU RPC irmão — usaremos RPC irmão
`rejeitar_proposta_placar(p_id, p_motivo)` para manter a auth no banco e dispensar policy de UPDATE.

### D6 — Rota de evidência (client da SESSÃO + signed URL; SEM service_role)
`GET /dashboard/torneios/[id]/evidencia/[tipo]/[refId]` (tipo `placar`|`wo`): valida sessão; resolve a
foto_path da proposta/solicitação (RLS da tabela já restringe a visão a arbitrar/jogador/solicitante);
se não vê a linha → 404; senão `storage.from('match_evidence').createSignedUrl(foto_path, 60)` com o
**client autenticado** (a storage SELECT policy D4 autoriza) e **302** para a URL. Sem chave nova no
runtime, sem bypass de RLS.

### D7 — `matches_update_participant` → só AVULSO; e o destino de `updateMatchTeams`
- A policy perde o ramo do técnico de vaga (mantém participante_1/2 avulso). O técnico competitivo não
  escreve a partida direto.
- `updateMatchTeams`: no COMPETITIVO o clube vem da vaga (T2 já removeu a busca de clube do menu
  competitivo). Então `updateMatchTeams` passa a autorizar **só avulso** (participante_1/2), NÃO o
  técnico de vaga — evitando o caminho-morto enganoso. Declarado em tasks.

### D8 — `updateMatchScore` aceita o aprovador (admin lança direto, sem foto)
Autoriza `ehJogadorDaPartida` avulso (participante) OU `podeArbitrar` (admin/árbitro, qualquer partida).
O técnico competitivo (que perdeu a RLS) é recusado com mensagem clara "envie para aprovação com foto".

### D9 — Upload na ACTION (espelha o avatar; sem path forjável)
`proporPlacar(formData: {matchId, placar_1, placar_2, foto: File})`: auth técnico de vaga; valida
`File` (≤5MB, `image/jpeg|png|webp`); a ACTION **constrói** o path `<uid>/<matchId>/<rand>.<ext>`
(→ o `match_id` do path É o da proposta, sem forja) e faz `storage.upload`; insere a proposta. Reenvio:
como há índice único parcial (1 pendente/técnico/partida), a action primeiro marca a pendente anterior
do mesmo técnico+partida como `rejeitada` (motivo "reenviada") via RPC/owner-update e remove a foto
antiga (best-effort), depois insere a nova. (Sem upload órfão: tudo dentro da action.)
**Rollback de foto órfã**: se o upload suceder mas o INSERT FALHAR, a action remove o arquivo recém
-enviado (`storage.remove`), espelhando `atualizarAvatar` (`profile.ts:122-124`).

### D10 — Notificações (paridade com W.O.)
- `proporPlacar` → notifica os **aprovadores** do torneio (há proposta pendente). best-effort.
- `aprovar/rejeitar` → notifica o **submetido_por** (aprovado / rejeitado + motivo p/ reenviar).

## UI
- **MatchCard / MatchScoreModalConnected** (`/dashboard`, `getActiveMatches`): novo modo derivado por
  partida. `getActiveMatches` passa a retornar, por partida, `podeArbitrar` (capacidade no torneio) e se
  é competitiva. `MatchScoreModalConnected` recebe `modoPlacar`: **competitivo & !podeArbitrar →
  'proposta'** (botão "Enviar para aprovação" + input de foto OBRIGATÓRIO com preview); senão 'direto'.
- **W.O.** (`SolicitarWoButton`, em `OpenMatchesList`): anexo de foto OPCIONAL. Antes, corrigir
  `jogaPartida` (`OpenMatchesList.tsx:63`) p/ reconhecer técnico de vaga (`vaga.tecnico.id===userId`).
- **Aprovação**: seção "Resultados pendentes" na página do torneio (espelha "Solicitações de W.O.
  pendentes", `page.tsx:542-563`): placar proposto + foto (rota D6) + Aprovar/Rejeitar(motivo). Visível
  a quem `podeArbitrar`. (A página do torneio já computa capacidade arbitral.)

## Edge cases (decisões registradas)
- **Aprovador que também é técnico**: cai em modo 'direto' (arbitrar vence) — lança sem foto. Aceito
  e documentado (o admin é confiável; a feature mira o NÃO-admin).
- 2 técnicos divergentes: ambas pendentes; aprovar uma encerra + rejeita a(s) outra(s) no RPC.
- Reabrir partida: o aprovador pode re-encerrar direto (D8) sem nova foto — coerente com "admin lança
  direto"; documentado (a obrigatoriedade da foto é do caminho do técnico).
- `liberada_em`: o INSERT de placar exige liberada; W.O. mantém o gate atual (sem liberada) — registrado.
- mata-mata: aprovar = único UPDATE placar+encerrada → trigger valida (rollback se empate) → erro claro.
- Avulso: inalterado (sem proposta/foto). Bye/órfã: sem técnico → sem proposta.

## Testes
- Unit: `proporPlacar` (auth técnico; recusa não-técnico/avulso/sem-foto/foto-grande/tipo-errado/
  encerrada; constrói path; reenvio substitui); `aprovar_proposta_placar` via action (auth arbitrar;
  aplica+encerra atômico; rollback em empate mata-mata; rejeita irmãs; guarda de encerrada);
  `rejeitar` (motivo, notifica); `updateMatchScore` (aceita aprovador, recusa técnico competitivo);
  `updateMatchTeams` (só avulso); `solicitarWO` (foto opcional).
- UI: modo 'proposta' exige foto p/ habilitar; 'direto' inalterado.
- Live (LOCAL): técnico envia placar+foto → pendente; admin vê foto (rota), aprova → encerra; rejeita
  c/ motivo → técnico reenvia; W.O. com foto; tentativa de ver foto alheia → 404; mata-mata empate recusa.
