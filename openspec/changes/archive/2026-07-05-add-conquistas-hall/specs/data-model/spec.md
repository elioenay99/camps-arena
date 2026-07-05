## ADDED Requirements

### Requirement: Tabela de conquistas (hall da fama)
A tabela `public.conquistas` SHALL registrar um troféu por linha, com as
colunas: `id uuid pk default gen_random_uuid()`, `competitor_id uuid not null
references league_competitors(id) on delete cascade`, `tipo text not null`
(CHECK em `campeao|vice|artilheiro|melhor_ataque|melhor_defesa|melhor_sequencia|
promovido|rebaixado`), `escopo text not null` (CHECK em
`temporada|torneio|copa`), `ref_id uuid not null` (POLIMÓRFICO — `season_id`,
`tournament_id` ou `cup_season_id` — SEM foreign key, para o troféu sobreviver à
remoção da competição), `ref_rotulo text not null` (rótulo estável da competição
materializado no fechamento), `nivel smallint` (divisão da liga; null em
torneio/copa), `valor_texto text`, `valor_num int`, `jogador text` (nome do
artilheiro; null nos demais), `conquistado_em timestamptz not null default
now()`. Uma restrição ÚNICA `(escopo, ref_id, competitor_id, tipo)` SHALL impor
idempotência (um troféu de cada tipo por competidor por competição). A tabela
NÃO SHALL denormalizar nome/escudo do competidor — a identidade resolve por join
a `league_competitors`. Índices em `(competitor_id)` e `(escopo, ref_id)` SHALL
acelerar a estante e a regravação por escopo.

#### Scenario: Um troféu de cada tipo por competidor/competição
- **WHEN** já existe um troféu Campeão do competidor X na temporada T e tenta-se inserir outro Campeão de X em T
- **THEN** a restrição única rejeita a duplicata

#### Scenario: Competidor pode ter troféus distintos na mesma competição
- **WHEN** o competidor X é Campeão da Série B e também Promovido na mesma temporada
- **THEN** ambos os troféus coexistem (tipos distintos, sem violar a unicidade)

#### Scenario: Troféu sobrevive à remoção da competição
- **WHEN** a temporada referenciada por um troféu é apagada
- **THEN** o troféu permanece (ref_id sem FK) e continua legível pelo rótulo materializado

#### Scenario: Apagar o competidor apaga seus troféus
- **WHEN** o competidor persistente é removido
- **THEN** suas linhas em `conquistas` são removidas (cascade)
