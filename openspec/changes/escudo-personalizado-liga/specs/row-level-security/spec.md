## ADDED Requirements

### Requirement: Escrita do escudo personalizado no bucket `escudos`

O bucket `escudos` SHALL aceitar, além dos escudos do catálogo ancorados em
`<external_id>.png`, objetos sob o prefixo `custom/<competitor_id>/<uuid>.<png|webp>`.

INSERT e DELETE sob o prefixo `custom/` SHALL ser permitidos SOMENTE a quem tem a
capacidade GERIR da liga dona daquele competidor. A autorização SHALL ser resolvida por uma
função `SECURITY DEFINER` com `search_path = ''` que valide o formato do path ANTES de
converter qualquer segmento para `uuid`, garantindo que um nome arbitrário devolva `false`
em vez de levantar erro de conversão.

Os escudos do catálogo (`<external_id>.png`) SHALL permanecer imutáveis por anon e
authenticated: a policy de DELETE nova SHALL casar exclusivamente o prefixo `custom/`, e
nenhuma policy de UPDATE ampla SHALL ser criada. O bucket SHALL continuar sem policy de
SELECT ampla (sem listagem).

A função de autorização SHALL manter `EXECUTE` concedido aos roles que avaliam a policy —
revogá-los quebraria a avaliação da própria policy.

#### Scenario: Gestor grava e troca o escudo do próprio competidor

- **WHEN** o dono ou um admin da liga envia um escudo para um competidor daquela liga
- **THEN** o objeto é gravado sob `custom/<competitor_id>/<uuid>.<ext>` e o arquivo
  anterior daquele competidor pode ser apagado

#### Scenario: Autenticado qualquer não grava no competidor alheio

- **WHEN** um usuário autenticado sem capacidade GERIR tenta gravar sob
  `custom/<competitor_id>/...` de uma liga que não gere
- **THEN** a policy recusa o INSERT

#### Scenario: Path malformado não derruba a policy

- **WHEN** o `name` do objeto não casa o formato esperado
- **THEN** a autorização devolve `false` sem levantar erro de conversão de tipo

#### Scenario: Catálogo global continua imutável

- **WHEN** um autenticado tenta apagar `117.png`
- **THEN** a operação é recusada, porque nenhuma policy de DELETE casa esse nome
