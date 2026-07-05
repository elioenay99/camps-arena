## ADDED Requirements

### Requirement: Pôster "Temporada encerrada"
O sistema SHALL expor um Route Handler de imagem (PNG via `next/og`) que renderiza
um pôster "Temporada encerrada" para uma temporada de liga, reusando o
estilo/marca do card de rodada (`renderRodadaOg`), destacando o campeão da
divisão de elite e os promovidos/rebaixados. A rota SHALL ser restrita ao dono da
liga (auth-gated, 404 sem oráculo de existência para quem não tem posse), no
mesmo padrão da imagem de rodada.

#### Scenario: Dono obtém o pôster
- **WHEN** o dono da liga acessa a rota de imagem da temporada encerrada
- **THEN** um PNG com o campeão e os promovidos/rebaixados é retornado (200)

#### Scenario: Sem posse retorna 404 sem vazar existência
- **WHEN** um usuário sem posse (ou anônimo) acessa a rota de imagem da temporada
- **THEN** a resposta é 404, sem revelar se a temporada existe
