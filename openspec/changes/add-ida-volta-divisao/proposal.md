## Why

O construtor de pirâmide de ligas **não oferece ida-e-volta para as divisões** — o único toggle de ida-e-volta no wizard é o de *playoff* (entre divisões). A RPC `montar_temporada` cria o `tournaments` de cada divisão **sem** setar `ida_e_volta`, então ele cai no default `false`: **toda divisão de liga nasce turno único**. Um dono que monta um "Brasileirão Série A" (20 clubes) recebe 190 partidas em 19 rodadas, sem caminho — nem no wizard, nem recriando — para chegar ao formato real (ida-e-volta: 380 partidas em 38 rodadas, 38 jogos por clube). Como não existe ação de apagar/refazer pirâmide, uma divisão já montada em rascunho fica **presa** no turno único.

## What Changes

- **Config por divisão**: cada divisão de `formato='liga'` escolhe independentemente **turno único** ou **ida e volta** no wizard (espelha como `formato`/`por_nome`/`desempate` já são por-divisão). Default mantém turno único (sem regressão).
- **Persistência**: a escolha mora em `league_division_seasons.ida_e_volta` (fonte de verdade) e é materializada em `tournaments.ida_e_volta` na montagem; sobrevive às temporadas (cópia na N+1).
- **Propagação na montagem**: `montar_temporada` passa a ler `ida_e_volta` da divisão e gravá-lo nos torneios criados (inclusive os DOIS torneios do split Apertura/Clausura).
- **Correção do rascunho existente**: nova Server Action (sobre RPC `SECURITY DEFINER` transacional) permite **ligar/desligar ida-e-volta numa divisão ainda em rascunho** (sem rodadas geradas), atualizando a division-season e o(s) torneio(s) vinculado(s) numa transação — destrava a Série A que o dono já montou.
- **Fora de escopo**: divisões `grupos_mata_mata` (lá `ida_e_volta` significaria turno duplo dentro de cada grupo — semântica distinta); ligas avulsas em rascunho (já têm o checkbox na criação).

## Capabilities

### Modified Capabilities

- **league-pyramid**: a montagem da temporada passa a espelhar `ida_e_volta` por divisão; a criação da pirâmide passa a configurar o formato (turno) por divisão de liga; nova capacidade de editar o formato de uma divisão em rascunho.

## Impact

- **DDL**: `league_division_seasons` +1 coluna (`ida_e_volta`); recriação de `montar_temporada`; nova RPC `atualizar_ida_e_volta_divisao` (SECURITY DEFINER). `tournaments.ida_e_volta` já existe. Sem DDL destrutiva; default preserva comportamento.
- **Código**: `divisaoSchema` (+`idaEVolta`), `createCompetition` (insert da divisão), `montarProximaTemporada` (`.select` + cópia N+1), nova action `atualizarIdaEVoltaDivisao`, `getSeason` (SELECT + tipos para o controle de correção), `DivisaoRascunho` + toggle no `LeagueWizard`, controle na superfície da divisão em rascunho, `database.types.ts`.
- **Segurança**: a correção do rascunho é gateada por `pode_gerir_competition` + status `rascunho` + ausência de rodadas (sonda `matches.rodada`), escrita TRANSACIONAL via RPC; RLS de UPDATE por CAPACIDADE (`pode_gerir_torneio`/`pode_gerir_competition`) como backstop.
- **Compatibilidade**: divisões/pirâmides existentes permanecem turno único até o dono optar; nenhuma tabela/rodada existente é alterada.
