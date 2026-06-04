# Design — add-match-creation

## Contexto

`matches` hoje: SELECT `using (true)` (dívida do Tier 1b), UPDATE só de participante, INSERT/DELETE negados. `tournaments` já tem `created_by`/`is_public` + RLS por dono. A criação de partida precisa (1) fechar a dívida de leitura antes de existir partida privada e (2) abrir escrita só para o dono do torneio.

## Decisões

### D1 — SELECT de `matches` segue o torneio, com cláusula de participante

```sql
using (
  exists (
    select 1 from public.tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid())
  )
  or auth.uid() = participante_1
  or auth.uid() = participante_2
)
```

- A subquery contra `tournaments` passa pela RLS de `tournaments` do próprio solicitante — e a condição testada (`is_public or created_by = auth.uid()`) é exatamente a policy de SELECT de torneio, então as duas camadas são consistentes (nenhuma linha "invisível" decide visibilidade).
- **Cláusula de participante é necessária**: sem ela, um participante convidado para partida em torneio PRIVADO de terceiro não enxergaria a própria partida — e o modal de placar quebra (o UPDATE até passaria pela policy, mas o `select` pós-update e o fetch de propriedade da action não retornariam linha).
- `anon` mantém leitura de partidas de torneios públicos (comportamento atual dos dados semeados; `auth.uid()` nulo zera as outras cláusulas).

### D2 — INSERT restrito ao dono do torneio E torneio não encerrado

```sql
with check (
  exists (
    select 1 from public.tournaments t
    where t.id = tournament_id
      and t.created_by = auth.uid()
      and t.status <> 'encerrado'
  )
)
```

- `t.status <> 'encerrado'` (e não `= 'ativo'`): falha-segura no mesmo espírito do `.neq` do dashboard — `rascunho` pode receber partidas (montagem de tabela antes de ativar); um status futuro novo não bloqueia silenciosamente.
- A action repete a checagem (mensagem de erro precisa) — RLS é a segunda barreira contra POST direto.

### D3 — `createMatch` como form action `(prevState, formData)`

Segue `createTournament` (form-based), não o padrão objeto de `updateMatchScore` (modal). Participantes são opcionais (`""` do select → `null`): a tabela admite partida sem participante definido (TBD de chaveamento futuro). Insert envia SÓ `{ tournament_id, participante_1, participante_2 }` — status e placares ficam com os defaults do banco; nenhum campo do form além dos validados é repassado.

### D4 — Ownership check na action por filtro, não por leitura+comparação

`select id, status from tournaments where id = ? and created_by = user.id` (`maybeSingle`). Filtrar por `created_by` no servidor é mais simples e não depende de RLS para a semântica; "não achou" vira mensagem única ("torneio não encontrado ou você não é o dono") — sem oráculo de existência de torneio privado alheio.

### D5 — Selects nativos na UI

Projeto não tem shadcn Select (mesma situação do checkbox no Tier 1b); adicionar a dependência só para este form é custo desnecessário. `<select>` nativo estilizado com tokens do design system. Participante: opção vazia "Definir depois".

### D6 — Fetchers dedicados em RSC

- `getOwnTournaments`: `eq("created_by", user.id)` + `.neq("status", "encerrado")`, ordenado por `created_at` desc. Filtro explícito no servidor (não confiar que a RLS "deixa só os meus" — ela também deixa públicos de terceiros).
- `getParticipantesDisponiveis`: `users` (id, nome) ordenado por nome — legível por authenticated (RLS `users_select_authenticated`); a página é protegida. Sem `celular` (PII desnecessária aqui).

## Riscos

- **Partidas órfãs de visibilidade**: partida cujo torneio fica privado depois — participantes seguem vendo (cláusula de participante); terceiros perdem acesso. Comportamento desejado.
- **Lista de usuários completa no select**: aceitável hoje (RLS já permite a authenticated; app é multi-usuário pequeno). Quando houver `participants` por torneio (Tier 3), o select passa a ser filtrado por torneio.
- **Aplicação manual do DDL**: até o usuário aplicar, criar partida pela app falha com RLS (mensagem genérica da action). Documentado em `docs/pendencias-manuais.md` com a ordem correta (SELECT estreitado junto/antes do INSERT).
