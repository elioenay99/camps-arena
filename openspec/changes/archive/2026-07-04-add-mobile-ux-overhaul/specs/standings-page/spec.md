## ADDED Requirements

### Requirement: Dois modos de visualização da classificação

A classificação SHALL oferecer dois modos alternáveis por um controle visível:
"Rolar pro lado" (todas as estatísticas com rolagem horizontal — comportamento
base) e "Caber tudo" (compacto, cabendo na largura da tela, mantendo as oito
estatísticas numéricas com fonte e padding menores e o nome encurtado). Um único
controle SHALL reconfigurar todas as tabelas da aba de classificação (grupos,
geral e clubes) simultaneamente. A tabela SHALL permanecer um componente de
servidor (RSC), reagindo ao modo por atributo do ancestral, sem receber o estado
por prop.

No mobile, o modo padrão SHALL ser "Caber tudo"; no desktop, "Rolar pro lado". A
preferência escolhida pelo usuário SHALL ser lembrada entre sessões
(`localStorage`) e SHALL ser lida apenas após a hidratação, com estado inicial
determinístico para não gerar divergência de hidratação. Na ausência do controle
(outros consumidores da tabela, como ligas), o comportamento SHALL ser o base
("rolar"), sem regressão.

#### Scenario: Celular abre em "Caber tudo"

- **WHEN** um usuário abre a classificação de um torneio pela primeira vez num
  celular (390px)
- **THEN** a tabela aparece compacta, com todas as estatísticas visíveis na largura
  da tela, sem rolagem horizontal

#### Scenario: Alternar e lembrar a preferência

- **WHEN** o usuário troca para "Rolar pro lado" e recarrega a página
- **THEN** a classificação reabre em "Rolar pro lado" (preferência persistida), com
  todas as tabelas da aba no mesmo modo

#### Scenario: Consumidor sem o controle não regride

- **WHEN** a mesma tabela é usada fora da aba (ex.: divisões de uma liga, sem o
  wrapper de modo)
- **THEN** ela renderiza no modo base ("rolar"), idêntica ao comportamento atual
