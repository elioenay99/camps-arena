## ADDED Requirements

### Requirement: Políticas de match_goals
A tabela `public.match_goals` SHALL ter RLS habilitado. A LEITURA (SELECT, para
`anon` e `authenticated`) SHALL espelhar a visibilidade da partida
(`matches_select_visivel`): só é visível o gol de uma partida que o usuário pode
ver — capacidade de ver bastidores do torneio, OU partida liberada
(`liberada_em <= now()`) de torneio público/participado, OU o próprio
participante/técnico de vaga. Gols de rodada OCULTA (não liberada) NÃO SHALL
vazar. A ESCRITA (INSERT/DELETE, para `authenticated`) SHALL derivar de quem
grava placar direto: capacidade ARBITRAR no competitivo
(`pode_arbitrar_torneio(m.tournament_id)`) OU participante do avulso
(`m.participante_1/2 = auth.uid()`) em partida liberada e não encerrada —
espelho de `matches_update_tournament_owner` + `matches_update_participant`. NÃO
SHALL haver policy de escrita para o técnico de vaga (o caminho dele é a proposta,
materializada pela RPC SECURITY DEFINER que ignora RLS). Os grants SHALL conceder
`select` a `anon`+`authenticated` e `insert, delete` a `authenticated`.

#### Scenario: Leitura acompanha a visibilidade da partida
- **WHEN** um anônimo lê gols de uma partida liberada de um torneio público
- **THEN** os gols são retornados

#### Scenario: Gol de rodada oculta não vaza
- **WHEN** um usuário sem capacidade de bastidores lê gols de uma partida de rodada não liberada
- **THEN** nenhuma linha é retornada

#### Scenario: Só quem grava placar escreve gols
- **WHEN** quem tem capacidade ARBITRAR (competitivo) ou o participante do avulso insere/apaga gols de uma partida não encerrada
- **THEN** a operação é permitida

#### Scenario: Técnico de vaga não escreve gols direto
- **WHEN** o técnico de uma vaga competitiva tenta inserir em `match_goals` direto
- **THEN** a RLS nega (o caminho é a proposta, materializada na aprovação)
