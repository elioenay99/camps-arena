## Contexto

Dois caminhos gravam placar + artilharia:

1. **Proposta → aprovação** (`aprovar_proposta_placar`, `schema.sql`): já é uma
   transação `SECURITY DEFINER` com `for update`, parse endurecido, materialização
   POR-LADO (só governa os lados presentes na proposta) e poda de invariante.
2. **Lançamento DIRETO** (`updateMatchScore`): 3 escritas PostgREST
   não-transacionais, REPLACE dos DOIS lados. É o caminho vulnerável.

Esta change traz o caminho 2 para o mesmo nível do caminho 1, sem mudar a
semântica observável do modal direto.

## Decisões

### RPC nova em vez de reusar `aprovar_proposta_placar`

`aprovar_proposta_placar` também **encerra** a partida e materializa POR-LADO (o
lado ausente fica intocado). O modal direto do organizador NÃO encerra e é REPLACE
dos DOIS lados (o modal pré-carrega ambos via `autoresIniciais`; enviar um lado
vazio é limpar intencional). Semânticas diferentes → função dedicada
`aplicar_placar_direto`, espelhando os blocos de endurecimento/poda, mas com:
- REPLACE incondicional dos dois lados quando `p_autores` é array (`delete lado in
  (1,2)` + insert), em vez do delete só-dos-lados-governados da proposta;
- sem transição de status.

### `p_autores = null` PRESERVA; array (incl. `[]`) faz REPLACE

Mantém a distinção load-bearing da action atual: reabrir + re-lançar SEM tocar na
captura (`autores === undefined`) não pode apagar a artilharia colaborativa. A
action traduz `undefined → null` e `[] → []`.

### Guarda otimista via `p_expected_status`

A action lê `match.status` para as pré-guardas de mensagem; passa esse valor como
`p_expected_status`. A RPC exige `status = p_expected_status` no `WHERE` do UPDATE
(além de `status <> 'encerrada'`). `row_count = 0` é desambiguado: se a linha está
`encerrada` agora → `PARTIDA_ENCERRADA`; senão → `PARTIDA_INDISPONIVEL` (mudou sob
o editor). Fecha o check-then-act não-atômico da l.141 original.

### Autz DENTRO da RPC (writer autoritativo)

`v_avulso := coalesce(participante_1 = uid, false) or coalesce(participante_2 =
uid, false)` — o `coalesce` é crítico: numa partida competitiva os `participante_*`
são NULL, e sem ele `null or false = null` faria o `if not (...)` NÃO lançar
(bypass de autorização). Com o coalesce a autz é um booleano estrito. A action
continua pré-checando (mensagens finas: técnico → "envie para aprovação";
não-participante → "você não participa"), mas a RPC é a barreira real.

### Divisão de trabalho action ↔ RPC (autores)

A action mantém `agregarAutores()` (JS, já testado — colapsa buckets por
`chaveAutor` e transforma anônimo em `jogador undefined`) e passa o array JÁ
agregado. A RPC RE-endurece (guards de tipo, range, teto por lado) porque é
alcançável por POST direto e é o writer autoritativo. Redundância deliberada
(defesa em profundidade), espelhando `aprovar_proposta_placar`.

### Impacto nos testes

O mecanismo saiu do app-layer (delete/insert/poda via PostgREST) para o SQL. Os
testes vitest que exercitavam a mecânica PostgREST (spies de delete/insert/poda,
colisão de índice único) passam a exercitar a **chamada da RPC** (args corretos +
mapeamento de erro). A mecânica real (atomicidade, rollback, dedupe por `lower()`,
poda de órfão, guarda otimista, autz sob `anon`/`authenticated`) é coberta por
pgTAP num Postgres real — o vitest mockado seria falso-verde para essas garantias.
