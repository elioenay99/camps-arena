# Design — add-escudo-artilharia

## Contexto
`getArtilharia` já resolve, por slot, o competidor e o nome do clube/rótulo
(`InfoVaga`). O escudo do clube vive em `teams.escudo_url` (URL final
rehospedada no Storage, ver `src/lib/escudos.ts`) e o embed `team:teams` já é
consultado — só não traz a coluna do escudo. O `TeamCrest` já aceita
`escudoUrl?: string | null` e cai no monograma quando ausente. Logo, a mudança é
puramente de propagação de dados.

## Decisões

- **Escudo tomado do MESMO slot do nome.** O ranking isola homônimos por
  `competitorId`; todos os slots de um competidor apontam para o mesmo clube,
  então o escudo do primeiro slot visto para aquele autor é estável e correto.
  Não há necessidade de resolver "o clube atual" — reaproveita o `InfoVaga` já
  montado.
- **`escudoUrl: string | null` (não opcional).** Espelha o contrato de
  `CompetidorPerfil.escudoUrl` e do `TeamCrest`; `null` explícito para
  por-nome/avulso.
- **Fallback intacto.** Competidor sem time (por-nome/avulso) → `escudoUrl`
  null → `TeamCrest` renderiza o monograma (cor estável por nome). Comportamento
  atual preservado para esse caso.
- **Página do competidor: sem mudança.** `CompetidorArtilheiros` é um grid de
  cards de contagem de gols, sem crest por linha — é um único competidor, cujo
  escudo real já aparece no `CompetidorHero`. Não há monograma a trocar;
  adicionar escudo repetido seria ruído visual. O item 3 do briefing é
  condicional ("se esse ranking também usa TeamCrest sem escudo") e não se
  aplica.

## Riscos / edge cases
- **Escudo inexistente/quebrado.** `TeamCrest` já trata erro de carregamento
  (`onError` → monograma). URL null idem. Sem regressão.
- **CSP/next-image.** O host do Storage já está em `remotePatterns`/CSP (mesma
  origem dos escudos de standings/landing). Nenhuma config nova.
- **Custo de query.** Adicionar `escudo_url` ao select existente não gera
  viagem extra — mesma consulta de slots.
