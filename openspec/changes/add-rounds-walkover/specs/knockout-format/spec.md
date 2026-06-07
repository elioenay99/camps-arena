# knockout-format — Delta Spec

## MODIFIED Requirements

### Requirement: Decisão de confronto na chave
`decidirConfronto` SHALL aceitar `woVencedor` por partida e, quando presente,
decidir o confronto pelo `woVencedor` ANTES de qualquer comparação de placar.
Em jogo único, o `woVencedor` é o vencedor e o outro lado o perdedor. Em
ida-e-volta, um W.O. em QUALQUER perna SHALL decidir o confronto inteiro (o
vencedor é o `woVencedor` da perna W.O.), sem exigir a outra perna nem o
agregado. Sem W.O., a decisão por placar/agregado permanece intocada.

#### Scenario: W.O. em jogo único
- **WHEN** a partida decisiva é W.O.
- **THEN** `decidirConfronto` devolve o `woVencedor` como vencedor (o 0x0 não
  vira indecidível)

#### Scenario: W.O. numa perna decide o ida-e-volta
- **WHEN** a ida é W.O. e a volta ainda está aberta
- **THEN** `decidirConfronto` já devolve o vencedor do confronto

### Requirement: Trigger de decisividade aceita W.O.
O trigger `valida_resultado_mata_mata` SHALL fazer early-return ao ENCERRAR uma
partida de chave (`posicao` não nula) marcada como `wo` — o W.O. é uma decisão
explícita (`wo_vencedor`) e não está sujeito às validações de empate em jogo
único nem de agregado na volta.

#### Scenario: W.O. 0x0 passa na chave
- **WHEN** uma partida de chave é encerrada como W.O. (0x0)
- **THEN** o trigger NÃO a rejeita como "empate em jogo decisivo"
