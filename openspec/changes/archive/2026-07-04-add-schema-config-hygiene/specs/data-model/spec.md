## ADDED Requirements

### Requirement: Definição única de policy no schema.sql

`supabase/schema.sql` é a fonte de verdade do banco e SHALL conter, para cada policy,
uma ÚNICA definição autoritativa — sem blocos `drop policy … create policy …`
duplicados que se sobrescrevam. Em particular, `matches_update_participant` SHALL ter
uma única definição (a forma ESTREITA, restrita a `participante_1`/`participante_2` em
partida liberada, na seção "PROPOSTA DE RESULTADO COM FOTO"); a definição AMPLA
anterior (que também concedia UPDATE ao técnico da vaga via `tournament_slots`) SHALL
ser removida por ser código MORTO — num apply completo de cima para baixo a forma
estreita já prevalecia, então a remoção é COSMÉTICA e NÃO altera o banco APLICADO nem
gera DDL para o dono aplicar. A semântica por-linha da policy é especificada em
`row-level-security`; este requisito trata apenas da HIGIENE da fonte de verdade (uma
definição, sem duplicata).

#### Scenario: Uma só definição da policy no schema

- **WHEN** `supabase/schema.sql` é lido
- **THEN** há exatamente um `create policy matches_update_participant on public.matches`
  (a forma estreita), sem bloco amplo duplicado

#### Scenario: Apply completo não muda o comportamento

- **WHEN** o `schema.sql` é aplicado por completo, antes e depois da remoção do bloco
  amplo
- **THEN** a policy vigente é idêntica (a estreita já vencia), sem diferença no banco
  aplicado
