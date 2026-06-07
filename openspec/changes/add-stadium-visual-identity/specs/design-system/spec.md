# design-system — Delta Spec

## MODIFIED Requirements

### Requirement: Design system com temas claro e escuro
A aplicação SHALL usar shadcn/ui (base Radix) com CSS variables e SHALL oferecer alternância entre tema claro e escuro, com escuro como padrão. A paleta SHALL carregar a identidade "Estádio à noite": no tema escuro, fundo verde-preto profundo com superfícies elevadas de mesmo matiz e `primary` verde-gramado elétrico; no claro ("dia de jogo"), a MESMA identidade com primário escurecido para contraste AA. Um token semântico `gold` (com foreground próprio e contraste adequado em cada tema) SHALL existir e ser usado EXCLUSIVAMENTE para conquistas (campeão, 1º lugar, disputa de 3º). A tipografia SHALL combinar uma família display (Space Grotesk, via `next/font`, exposta como `font-display`) para marca/títulos/placares com a família de corpo existente. A aplicação SHALL ter favicon/ícone próprios (`app/icon.svg`). Animações decorativas novas SHALL respeitar `prefers-reduced-motion`.

#### Scenario: Tema escuro por padrão
- **WHEN** um visitante acessa a aplicação pela primeira vez
- **THEN** o tema escuro "estádio à noite" é aplicado por padrão

#### Scenario: Alternância de tema
- **WHEN** o usuário aciona o controle de tema
- **THEN** a interface alterna entre claro e escuro sem recarregar a página, mantendo a identidade e o contraste AA

#### Scenario: Dourado é exclusivo de conquista
- **WHEN** qualquer superfície usa o token gold
- **THEN** o uso corresponde a campeão, 1º lugar ou disputa de 3º — nunca a elementos neutros

#### Scenario: Movimento reduzido respeitado
- **WHEN** o sistema do usuário declara prefers-reduced-motion
- **THEN** animações decorativas (pulse, lift) não são aplicadas
