# Design — add-knockout-format

## Context

A Liga (add-league-format) deixou a fundação pronta: enum `tournament_format`,
`matches.rodada`, padrão de motor puro (`gerarTabelaLiga`), action de início
com INSERT em lote atômico + promoção de status falha-segura, índice único
parcial contra dupla geração, bloqueios de partida manual e adesão tardia.
O mata-mata reutiliza tudo isso e adiciona o que eliminatória exige e liga
não tem: **estrutura de chave** (quem enfrenta quem na fase seguinte),
**vencedor obrigatório** e **avanço por fases**.

Decisões de produto (AskUserQuestion, 2026-06-06): 3 modos de chaveamento
(sorteio, potes, manual); qualquer N de 2 a 32 com byes (potes exige potência
de 2); empate bloqueado no encerramento; ida-e-volta opcional com final e 3º
lugar sempre em jogo único; 3º lugar opcional; jogo único é o padrão.

## Goals / Non-Goals

**Goals:**

- Formato `mata_mata` de ponta a ponta: criação → adesão por convite →
  chaveamento ao Iniciar → lançar/encerrar placar → avançar fase → campeão.
- Chave íntegra por construção: pareamento determinístico persistido em
  `(rodada, posicao, perna)`, dupla geração barrada no banco, resultado
  decisivo garantido por trigger (defesa em profundidade, padrão do projeto).
- Motor 100% puro e testável (aleatoriedade injetada pelo chamador).

**Non-Goals:**

- Grupos + mata-mata e fase de liga (Champions) — proposals futuras; este
  change não cria tabelas `groups`/`stages`.
- Edição da chave após o Iniciar (refazer sorteio, trocar slot) — corrigir =
  excluir o torneio e recriar.
- W.O./desistência no meio do torneio; "sorteio ao vivo" animado.
- Away goals (gol fora NÃO desempata agregado — regra abolida pela UEFA;
  agregado empatado bloqueia o encerramento da volta).

## Decisions

### D1 — Chave flat em `matches` com `(rodada, posicao, perna)`; geração FASE A FASE

A chave vive nas próprias partidas: `rodada` (fase, 1-based), `posicao` (slot
do confronto dentro da fase, 1-based) e `perna` (1|2 em ida-e-volta; NULL em
jogo único). Pareamento fixo: **vencedor do slot 2i−1 × vencedor do slot 2i →
slot i da fase seguinte**. A fase seguinte só é INSERIDA quando a anterior
termina (action `avancarFase`).

*Alternativa rejeitada — gerar a chave inteira no Iniciar com participantes
NULL e preenchê-los via UPDATE*: o trigger `lock_match_relations` trava
`participante_1/2` contra UPDATE (proteção central do modelo); preencher
exigiria SECURITY DEFINER ou enfraquecer o lock. INSERT fase a fase reusa o
padrão da liga (lote atômico + 23505) sem tocar na proteção.

*Alternativa rejeitada — tabela própria de bracket (`stages`/`slots`)*: mais
fiel ao domínio, porém DDL e RLS novos para um ganho que `(rodada, posicao)`
já entrega; os formatos futuros (grupos) reavaliam isso.

### D2 — Bye é partida persistida: `participante_2 NULL`, `status 'encerrada'`, 0×0

O slot do bye precisa ser memória durável (o pareamento da fase 2 depende
dele) e o sorteio não é re-derivável. Partida-bye no slot certo resolve sem
DDL extra: `avancarFase` lê vencedor = `participante_1` quando `participante_2
IS NULL`; `computeStandings` já ignora partidas sem os dois participantes; a
policy de INSERT não restringe `status` e `lock_match_lifecycle` é
BEFORE UPDATE (inserir já encerrada é permitido ao dono). Máximo de 1 bye por
confronto é garantido por construção (B = S − N < S/2). Reabrir um bye é
proibido (action + trigger) — não há placar a corrigir.

### D3 — Tamanho da chave = próxima potência de 2 (S), N de 2 a 32

`KO_MAX_PARTICIPANTES = 32` (chave máxima de 32 → 5 fases). Rodadas =
log2(S). Rótulo por nº de confrontos da fase: 1=Final, 2=Semifinais,
4=Quartas de final, 8=Oitavas de final, 16="1ª fase" (chave de 32).

### D4 — Modo de chaveamento NÃO persiste; montagem em helpers puros

O modo (`sorteio` | `potes` | `manual`) é parâmetro do Iniciar — colunas para
isso não pagam o custo (auditoria irrelevante no MVP). Montagem dos S slots em
funções puras: sorteio embaralha (Fisher-Yates com `randInt` injetado;
implementação real usa rejection sampling sem viés de módulo, padrão do
invite-code); potes posiciona cabeças em slots espaçados e sorteia o resto;
manual recebe os confrontos do form. Byes distribuídos no máximo 1 por
confronto. Potes exige S ∈ {4, 8, 16, 32} com exatamente S/2 cabeças
(marcadas por checkbox no painel — zero DDL em `participants`).

### D5 — Action nova `iniciarMataMata(prev, formData)`; `iniciarTorneio` da liga intocada

O Iniciar do mata-mata carrega payload (modo, cabeças, confrontos) — assinatura
incompatível com `iniciarTorneio(tournamentId)`. Action separada preserva o
contrato e os testes da liga; o painel renderiza o form do formato. A
sequência interna espelha a liga: propriedade/formato/estado por FILTRO →
recuperação idempotente (já existem partidas com rodada → promove) → monta
slots → INSERT em lote único → promove `rascunho → ativo` → revalidate.

### D6 — `avancarFase(tournamentId)`: vencedores da fase máxima → INSERT da seguinte

Fase atual = `max(rodada)` das partidas do torneio. Pré-condições: dono,
mata-mata, `status = 'ativo'`, todas as partidas da fase encerradas (em
ida-e-volta: ambas as pernas). Vencedor por slot: bye → `participante_1`;
jogo único → placar; ida-e-volta → agregado. Semifinais → gera final
(posicao 1) e, se `terceiro_lugar` e ambos os confrontos da semi tiveram
perdedor REAL, o 3º lugar (posicao 2) com os perdedores. Fase final
encerrada → nada a gerar (campeão = vencedor do slot 1; UI exibe). Corrida /
duplo clique: índice único por slot → 23505 → "fase já avançada".

### D7 — Ida-e-volta: 2 partidas com a mesma `(rodada, posicao)`, perna 1 e 2, lados invertidos

Ambas inseridas juntas na geração da fase. Final e 3º lugar SEMPRE jogo único
(perna NULL), mesmo com `ida_e_volta = true` (decisão de produto). Byes são
sempre partida única (perna NULL). Vencedor = agregado puro (sem away goals).

### D8 — Resultado decisivo garantido por trigger (`valida_resultado_mata_mata`)

BEFORE UPDATE em `matches`, só quando o torneio é `mata_mata` e a partida tem
`rodada` (service_role isento, padrão dos locks):

- **Encerrando** (status → `encerrada`): bye (p2 NULL) passa; jogo único exige
  `placar_1 <> placar_2`; perna 1 passa (empate ok) — EXCETO quando a perna 2
  já está encerrada (fluxo reabrir→corrigir→re-encerrar a ida): o agregado
  completo é revalidado, senão o slot persistiria "fechado" empatado; perna 2
  exige perna 1 encerrada E agregado não-empatado.
- **Reabrindo** (encerrada → outro): rejeita se existir partida do torneio com
  `rodada > OLD.rodada` (vencedor já semeado adiante — reabrir tornaria a
  chave incoerente); rejeita bye sempre.

As mesmas regras vivem nas actions (`encerrarPartida`/`reabrirPartida`) com
mensagens pt-BR; o trigger é o backstop contra POST direto. Índice único novo:
`unique (tournament_id, rodada, posicao, perna) nulls not distinct where
posicao is not null` — `nulls not distinct` (PG15+) é essencial: sem ele,
`perna NULL` duplicaria slots de jogo único.

### D9 — Página do torneio: bracket no lugar da classificação

`formato = 'mata_mata'` → renderiza `BracketView` (RSC puro: colunas por fase,
confronto com nomes/placar/agregado, bye rotulado, campeão destacado ao fim;
overflow-x para mobile) NO LUGAR de `StandingsTable` (pontos corridos não
significam nada em eliminatória) e da classificação de clubes. As seções
operacionais permanecem (Partidas em aberto com Encerrar; histórico com
Reabrir) — são o console do dono. Painel de início ganha os 3 modos; prévia
via `previaKO` (fórmulas fechadas: confrontos reais = N−1; jogos = ida-e-volta
? 2·(N−2)+1 : N−1; +1 se 3º lugar; fases = log2(S)) — mesma fonte para motor
e UI, padrão `previaLiga`.

### D10 — Sem mudança na policy de INSERT nem no motor de standings

`matches_insert_tournament_owner` já exige `formato = 'avulso' OR rodada IS
NOT NULL`: as partidas geradas (sempre com rodada) passam, e partida manual em
mata-mata é barrada porque `createMatch` não envia rodada. Na action, o gate
`formato === "liga"` generaliza para `formato !== "avulso"`. `computeStandings`
e `gerarTabelaLiga` ficam intocados.

### D11 — Mata-mata ativo CONGELA a lista de participantes (achado da validação adversarial)

A chave avança fase a fase e o INSERT da fase seguinte exige cada vencedor em
`participants` (cláusula da RLS de INSERT de matches). Sair/ser removido com
o torneio ativo tornaria o "Avançar fase" permanentemente impossível (RLS
rejeita, retry nunca resolve — e o convite não readmite, pois mata-mata fora
de rascunho rejeita aceite). Decisão: `sairDoTorneio`/`removerParticipante`
rejeitam mata-mata ativo (mensagem precisa) + cláusula na policy
`participants_delete_self_or_owner` (backstop) + botões ocultos na UI. Liga
não precisa (todas as partidas nascem no Iniciar); rascunho e encerrado
seguem livres. Defesa em profundidade adicional: `avancarFase` pré-verifica
os semeados em `participants` e devolve mensagem ACIONÁVEL caso uma linha
tenha sumido por via administrativa (em vez de erro genérico de RLS).

## Riscos / Trade-offs

- **[ALTER TYPE ADD VALUE no mesmo script que usa o valor]** → PG não permite
  usar valor novo de enum na MESMA transação que o criou. A seção 10 das
  pendências instrui a rodar em **dois blocos separados** (bloco A: ALTER
  TYPE; bloco B: resto). Os literais `'mata_mata'` em corpo de função PL/pgSQL
  são texto (avaliados em runtime) e não disparam o problema.
- **[Reabertura bloqueada por fase inteira]** → mais grosso que o mínimo
  (bloqueia reabrir qualquer partida de fase anterior, mesmo as do "outro
  lado" da chave). Correto por segurança: placar reaberto pode mudar o
  vencedor já semeado. Corrigir erro tardio = caso raro, fica sem solução
  in-app neste MVP (registrado).
- **[3º lugar com semi-bye]** → com N=3 (S=4), uma semi é bye e não há dois
  perdedores reais: o 3º lugar NÃO é gerado (regra explícita, coberta por
  teste). Com S≥8 nunca acontece (byes só na 1ª fase).
- **[Bye visível como partida]** → histórico e listas mostram a partida-bye
  (p2 "A definir", 0×0). Mitigação: componentes rotulam bye quando
  `mata_mata` + `participante_2 NULL`; o motor de standings as ignora.
- **[Duas escritas sem transação no avanço]** → só há UMA escrita (INSERT em
  lote); não há promoção de status no avanço. O Iniciar repete o padrão da
  liga (INSERT → UPDATE status), cuja ordem é falha-segura e idempotente.
- **[Empate "resolvido" fora do app]** → placar da decisão (prorrogação/
  pênaltis) é embutido no placar do jogo; o app não registra a disputa de
  pênaltis em separado. Limitação honesta do MVP (campos de pênaltis foram
  opção rejeitada pelo usuário).
- **[Listas planas rotulam fase como "R{n}"]** → "Partidas em aberto" e o
  histórico mostram `R1/R2` (+ ida/volta) em vez de "Semifinais"/"Final", e
  não distinguem final de 3º lugar — as listas não recebem `posicao`. Baixo
  valor corrigir agora: o BracketView é a visão primária da chave (rótulos
  corretos). Tratar se feedback de usuário apontar confusão.

## Migration Plan

1. `supabase/schema.sql` atualizado (fonte de verdade) na mesma entrega.
2. Nova seção 10 em `docs/pendencias-manuais.md`: bloco A (ALTER TYPE) +
   bloco B (coluna, CHECKs, índice, `lock_match_relations` estendida, trigger
   novo, `aceitar_convite` recriada), idempotente, com rollback documentado
   (drop trigger/índice/colunas; enum value NÃO é removível — fica órfão e
   inofensivo).
3. Sem a seção 10, criar torneio pela app FALHA (action envia
   `terceiro_lugar`) — mesmo regime das seções 6–9: avisar o usuário no
   fechamento do change.

## Open Questions

Nenhuma — decisões de produto fechadas via AskUserQuestion em 2026-06-06.
