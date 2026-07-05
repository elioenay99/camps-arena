## Why

No ranking de **Artilheiros** (competição e pirâmide), o `TeamCrest` de cada
linha cai sempre no MONOGRAMA (iniciais do nome do competidor) porque o shape
`ArtilhariaLinha` não carrega escudo. Como o Goliseu modela videogame, é comum
vários competidores usarem o MESMO nome de jogador (Romário, Zico, Pelé…) — o
ranking já os separa por competidor (`competitorId`), mas visualmente duas
linhas "Romário" ficam indistinguíveis. O que diferencia dois competidores é o
ESCUDO DO CLUBE. Faltando o escudo real, o ranking perde o sinal visual que
identifica de quem é cada artilheiro.

O escudo já está no banco (`teams.escudo_url`, rehospedado no Storage próprio) e
já é renderizado em standings/landing/perfil — só não é propagado pela camada de
dados da artilharia. Esta change fecha essa lacuna, sem schema novo.

## What Changes

- **Camada de dados (`getArtilharia`).** O select de `tournament_slots` passa a
  trazer `team:teams ( nome, escudo_url )`. Cada `InfoVaga` ganha
  `escudoUrl: string | null` (do MESMO slot de onde já vem o nome — slots do
  mesmo competidor apontam para o mesmo clube). O tipo `ArtilhariaLinha` ganha
  `escudoUrl: string | null`. Competidor por-nome/avulso (sem time) →
  `escudoUrl` null.
- **UI (`ArtilhariaRanking`).** Passa `escudoUrl={linha.escudoUrl}` ao
  `<TeamCrest>`. Fallback do `TeamCrest` (monograma) preservado para quem não
  tem escudo.
- **Sem mudança na página do competidor.** A seção "Artilheiros" da carreira
  (`CompetidorArtilheiros`) NÃO renderiza escudo/monograma por linha — é um
  único competidor, e o escudo REAL dele já aparece grande no `CompetidorHero`
  (via `CompetidorIdentidade`). Não há monograma a substituir; adicionar um
  escudo repetido por card seria redundante. Item verificado, sem ação.

## Capabilities

### Modified Capabilities
- `goal-scorers`: cada linha do ranking de artilharia carrega o escudo do clube
  do competidor (quando houver), com fallback para o monograma.

## Impact

- **Código de aplicação:**
  - `src/features/league/data/getArtilharia.ts` (select + `escudoUrl` em
    `InfoVaga` e `ArtilhariaLinha`).
  - `src/features/league/components/ArtilhariaRanking.tsx` (repassa `escudoUrl`
    ao `TeamCrest`).
- **Banco de dados:** nenhuma DDL. `escudo_url` já existe em `public.teams`.
- **Config:** nenhuma. O host do escudo já está em `remotePatterns`/CSP (o app
  já renderiza escudos em standings/landing/perfil).
- **Performance:** sem N+1 nem query nova — o escudo vem no MESMO select de
  slots que já existe.
- **Testes:** `getArtilharia.test.ts` atualizado para o novo campo `escudoUrl`;
  suíte atual permanece verde.
