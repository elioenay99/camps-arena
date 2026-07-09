## ADDED Requirements

### Requirement: Grants e escopo da RPC registrar_autores_lado
A RPC `public.registrar_autores_lado(uuid, smallint, jsonb, text)` SHALL ser
`SECURITY DEFINER` com `set search_path = ''` e SHALL ter `EXECUTE` revogado de
`public` e `anon` e concedido a `authenticated`. Sendo definer, a RPC IGNORA a RLS
de `match_goals` — por isso ela SHALL re-verificar internamente, ANTES de escrever:
(1) `auth.uid()` não nulo; (2) `p_lado` ∈ {1,2}; (3) `p_modo` ∈ `{append, replace}`
(senão `MODO_INVALIDO`); (4) a existência da partida e da VAGA do lado (escopo
competitivo — sem vaga, recusa); (5) autorização POR MODO — `append` exige TÉCNICO
daquele lado (`tournament_slots.user_id = auth.uid()`) OU ARBITRAR
(`pode_arbitrar_torneio`); `replace` exige SOMENTE ARBITRAR. O modo NÃO SHALL ser
inferido do papel (evita o footgun dual-role). A RPC SHALL escrever EXCLUSIVAMENTE
nas linhas de `(match_id, lado)` indicadas — NUNCA no lado oposto — e SHALL impor o
teto do lado (soma de gols normais + gols contra ≤ `placar[lado]`), rejeitando o
excesso; o parse SHALL truncar `gols` com `floor((…)::numeric)::int` para não
abortar com `22P02` num valor fracionário forjado. A RPC NÃO SHALL alterar
`status`/`placar` da partida; SHALL apenas materializar os autores do lado, inclusive
com a partida ENCERRADA (é o caminho de completar artilheiros após a validação, que
a policy de INSERT de `match_goals` — restrita a `status <> 'encerrada'` — não
permitiria pelo cliente).

As policies de LEITURA/ESCRITA de `match_goals` SHALL permanecer INALTERADAS por
esta change (SELECT espelha a visibilidade da partida; INSERT/DELETE diretos seguem
restritos a quem grava placar direto em partida não encerrada). O caminho
colaborativo pós-validação SHALL passar SOMENTE pela RPC definer.

#### Scenario: EXECUTE só para authenticated
- **WHEN** um cliente `anon` tenta `POST /rest/v1/rpc/registrar_autores_lado`
- **THEN** a chamada é negada por falta de `EXECUTE`, enquanto um `authenticated` autorizado consegue chamar

#### Scenario: RPC escreve com a partida encerrada, sem furar a RLS
- **WHEN** o técnico do lado chama a RPC numa partida ENCERRADA para completar seus artilheiros
- **THEN** a RPC (definer) grava os autores daquele lado, ainda que a policy de INSERT direto de `match_goals` negue escrita em partida encerrada

#### Scenario: RPC nunca toca o lado oposto
- **WHEN** a RPC é chamada para o lado 1
- **THEN** apenas linhas de `(match_id, 1)` são alteradas; o lado 2 permanece intacto

#### Scenario: Autorização re-verificada dentro do definer
- **WHEN** um usuário sem capacidade de arbitrar e que não é técnico do lado chama a RPC (append)
- **THEN** a RPC levanta erro de autorização e nada é gravado, apesar de ser SECURITY DEFINER

#### Scenario: Replace exige árbitro mesmo no definer
- **WHEN** o técnico de um lado (sem arbitrar) chama a RPC com `p_modo = 'replace'`
- **THEN** a RPC levanta `NAO_AUTORIZADO` (replace é exclusivo de quem arbitra), sem gravar
