# Design — add-artilharia (backend)

## 1. Modelo: `match_goals` genérica, competidor por JOIN

A tabela guarda `(match_id, lado, jogador, gols)` — o mínimo. NÃO denormaliza
`competitor_id` porque o lado (`matches.vaga_1/2`) é IMUTÁVEL (trigger
`lock_match_relations`), então o competidor é sempre resolvível pelo JOIN
`match_goals.lado → matches.vaga_{lado} → tournament_slots.competitor_id →
league_competitors.id`. Denormalizar só criaria uma cópia a manter em sincronia.

Contra-partida: `on delete cascade` em `match_id` — apagar a partida apaga os
gols (coerente; sem partida não há artilharia). O nome do autor é TEXTO LIVRE
(decisão travada do dono): não há tabela de jogadores; o autocomplete sugere os
nomes que AQUELE competidor já usou.

### Normalização
Guardamos `jogador` já com `btrim` (Zod `.trim()` + `btrim` no SQL da RPC). A
UNICIDADE por partida/lado e a AGREGAÇÃO do ranking usam `lower(btrim(jogador))`
— "Endrick" e "endrick" na mesma partida/lado são a mesma linha (índice único
FUNCIONAL). O ranking exibe UMA grafia (a mínima/estável do grupo). Robustez
barata contra grafia divergente; MVP não tenta normalizar acentos/apelidos.

## 2. Chave de agregação: `(competidor, nome_normalizado)`

Decisão travada: artilheiro é SEPARADO por competidor. "Endrick (do Ataias)" ≠
"Endrick (do João)". O ranking e a carreira agregam por `(competitor_id,
lower(btrim(jogador)))`. O `competitor_id` é a âncora persistente da pirâmide
(estável entre temporadas/divisões), a MESMA chave que `getCompetitorProfile` e
`getDivisionStandings` já usam.

## 3. Resolução lado→competidor: em TypeScript, sem VIEW

Avaliei uma VIEW `match_goals_resolved` (encapsular o JOIN). DECIDI NÃO criar:

- O codebase já resolve slot→competidor em TS (`getDivisionStandings.ts`
  monta um `Map<slot_id, competitor_id>`); seguir o padrão é mais coerente que
  introduzir a primeira VIEW de domínio.
- Uma VIEW com `security_invoker=on` reaplicaria a RLS de `tournament_slots` no
  JOIN (linhas a mais filtradas de formas sutis); sem invoker, viraria um
  bypass de RLS a auditar. Menos DDL = menos superfície.

As funções de dados fazem: (a) buscar os slots do competidor / os slots da(s)
partida(s); (b) buscar `match_goals` das partidas; (c) casar lado→competidor em
memória. A RLS de `match_goals` (leitura por visibilidade da partida) continua
sendo a barreira — nenhuma função usa `service_role`.

## 4. Fluxo direto vs. proposta — onde os gols entram

- **Direto (`updateMatchScore`)**: quem grava é ARBITRAR (competitivo) ou
  participante (avulso) — nunca o técnico de vaga (esse PROPÕE). Após o UPDATE de
  placar, delete-then-insert em `match_goals` pelo client da SESSÃO; a RLS de
  escrita de `match_goals` espelha exatamente essa autorização. `autores`
  ausente = não mexe nos gols (retrocompat); `autores: []` = limpa.
- **Proposta (`proporPlacar`)**: o técnico não pode escrever `match_goals`
  direto (RLS nega). Os autores viajam em `match_score_proposals.autores` (jsonb)
  e são materializados DENTRO da RPC `aprovar_proposta_placar` (SECURITY
  DEFINER), no MESMO passo atômico que copia o placar e encerra. Assim placar e
  gols ficam consistentes; rejeição descarta tudo por cascade.

### Atomicidade
O delete-then-insert do fluxo direto NÃO é transacional entre chamadas PostgREST
(aceitável no MVP — o placar já foi salvo; falha no insert retorna erro claro). O
fluxo de proposta É atômico (tudo numa função). A RPC AGREGA por `(lado,
lower(jogador))` ao inserir (defende contra `autores` duplicado forjado por POST
direto na proposta: soma em vez de estourar o índice único e travar a aprovação).

## 5. Validação dos autores (Zod)

`autorGolSchema = { lado: 1|2, jogador: trim 1..60, gols: int 1..99 }`. O schema
composto (`updateMatchScoreSchema`/`proporPlacarSchema`) faz `superRefine`:
- soma de `gols` por lado ≤ placar daquele lado (não se pode marcar mais gols do
  que o placar registra) — erro no path `autores`;
- sem autor duplicado no mesmo lado (case-insensitive) — a UI deve somar num só
  item; duplicata é entrada inconsistente, rejeitada.
Marcar MENOS autores que o placar é permitido (gols "sem autor" — MVP tolera
placar parcialmente atribuído).

## 6. Avulso — escopo

Gravar gols no avulso É permitido (a RLS cobre o participante). Mas ranking e
carreira vivem na PIRÂMIDE (competidor persistente); no avulso não há
`competitor_id`. Então `getArtilharia`/`getArtilheirosDoCompetidor` focam o
COMPETITIVO e IGNORAM linhas sem competidor resolvido. `getScorerSuggestions` é
por competidor (competitivo); o autocomplete do avulso pode vir depois (por
usuário) — documentado, fora do MVP.

## 7. DDL não aplicada

`supabase/schema.sql` (fonte de verdade) recebe a tabela, a coluna, as policies e
a RPC estendida; `ddl.sql` traz o SQL exato com pré-checagens no estilo dos
comentários existentes. O dono aplica manualmente (REGRA 4). Esta change NÃO toca
o banco.
