# Proposal — add-league-format

## Why

Hoje todo torneio é "avulso": o dono cria cada partida à mão, uma a uma. Para um
campeonato de pontos corridos entre N participantes isso é tedioso e propenso a
erro (combinações esquecidas, duplicadas, sem noção de rodada). O usuário pediu
formatos de torneio; a primeira fatia (decidida via AskUserQuestion) é a **Liga**:
pontos corridos com geração automática da tabela — ida simples ou ida-e-volta —
emparelhando **participantes** (pessoas), gerada quando o dono clica **Iniciar**
(o fluxo de convite por link continua valendo durante o `rascunho`). Grupos,
mata-mata e potes ficam para proposals futuras; este change cria a fundação
(`formato` + `rodada`) que eles reutilizam.

## What Changes

- `tournaments` ganha `formato` (`'avulso'` default — preserva legados — ou
  `'liga'`) e `ida_e_volta boolean` (só significativo em liga).
- Torneio criado com formato liga nasce em `status = 'rascunho'` (valor já
  existente no enum, hoje sem uso real) — período de adesão via convite.
- `matches` ganha `rodada integer` anulável (`null` = partida avulsa; em liga,
  toda partida gerada tem rodada >= 1).
- Novo motor PURO `gerarTabelaLiga` (round-robin pelo método do círculo,
  determinístico, ida simples ou ida-e-volta) — zero IO, segue o padrão do
  `computeStandings`.
- Nova Server Action `iniciarTorneio`: só o dono, só liga em `rascunho`, exige
  >= 2 participantes confirmados; insere todas as partidas com rodada e promove
  o torneio a `'ativo'`.
- Aceite de convite **bloqueado em liga já iniciada** (entrar depois da tabela
  gerada deixaria o participante órfão de partidas) — função `aceitar_convite`
  ganha a checagem; preview (`info_convite`) passa a expor o necessário para a
  página de convite explicar o estado.
- Criação manual de partida **bloqueada em torneio liga** (partida extra
  poluiria a classificação) — na action e na RLS.
- UI: `TournamentForm` ganha escolha de formato (avulso/liga) + ida-e-volta;
  página do torneio ganha painel "Iniciar torneio" (dono, liga em rascunho) com
  contagem de participantes e partidas a gerar; partidas exibidas com a rodada
  quando houver.
- DDL manual: nova seção 9 em `docs/pendencias-manuais.md` (colunas + CHECKs +
  policy + funções atualizadas). **Sem ela, criar torneio pela app FALHA**
  (action passa a enviar `formato`/`ida_e_volta`).

## Capabilities

### New Capabilities

- `league-format`: formato de torneio Liga — escolha na criação, período de
  adesão em rascunho, geração automática da tabela round-robin (ida/volta) ao
  iniciar, bloqueio de partida manual e de adesão tardia.

### Modified Capabilities

- `tournament-management`: criação de torneio ganha formato (avulso/liga) e
  ida-e-volta; liga nasce em rascunho.
- `tournament-participants`: aceite de convite rejeita liga já iniciada (além
  de torneio encerrado).
- `match-creation`: criação manual de partida passa a exigir torneio de formato
  avulso.
- `data-model`: colunas `tournaments.formato`/`tournaments.ida_e_volta`,
  `matches.rodada`, CHECKs de coerência.
- `row-level-security`: INSERT de `matches` espelha a regra de formato;
  `aceitar_convite`/`info_convite` atualizadas.
- `standings-page`: partidas (abertas e histórico) identificam a rodada quando
  presente.

## Impact

- **Banco (DDL manual)**: `supabase/schema.sql` + seção 9 das pendências —
  2 colunas em `tournaments`, 1 em `matches`, CHECKs, policy de INSERT de
  `matches` reescrita, `aceitar_convite`/`info_convite` recriadas.
- **Actions**: `tournaments.ts` (createTournament envia formato; nova
  `iniciarTorneio`), `match.ts` (createMatch rejeita liga).
- **Schemas Zod**: `tournamentSchema.ts` (formato/idaEVolta espelhando CHECKs).
- **Features**: novo `src/features/league/` (motor puro + testes); página do
  torneio (`dashboard/torneios/[id]`) e seus componentes; `TournamentForm`.
- **Não muda**: `computeStandings` (agnóstico — a liga cai na classificação
  existente), fluxo de placar/lifecycle de partida, dashboard.
- **Compat**: torneios existentes viram `formato='avulso'` por default; nenhum
  comportamento atual muda para eles.
