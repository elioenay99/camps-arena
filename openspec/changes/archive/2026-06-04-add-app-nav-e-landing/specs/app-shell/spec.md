## ADDED Requirements

### Requirement: Navegação autenticada persistente
Todas as páginas do segmento `/dashboard` SHALL exibir um header persistente com a marca (link ao painel), navegação para Painel, Novo torneio e Nova partida (com `aria-current="page"` no item ativo), alternador de tema e botão Sair. O header NÃO SHALL aparecer para visitantes (o segmento é protegido) nem em fluxos focados (auth, recuperação de senha).

#### Scenario: Navegar por botões entre as páginas
- **WHEN** um usuário autenticado está em qualquer página do painel
- **THEN** ele alcança Painel, Novo torneio e Nova partida pelo header, sem digitar URL

#### Scenario: Item ativo sinalizado
- **WHEN** o usuário está numa rota do menu
- **THEN** o link correspondente carrega `aria-current="page"` e destaque visual

#### Scenario: Sair de qualquer página
- **WHEN** o usuário aciona Sair no header
- **THEN** a sessão encerra e ele volta ao fluxo público

### Requirement: Landing pública na raiz
A rota `/` SHALL apresentar o sistema a visitantes (proposta de valor e destaques) com chamadas para "Criar conta" (`/cadastro`) e "Entrar" (`/login`). Usuário autenticado que acessa `/` SHALL ser redirecionado ao `/dashboard`.

#### Scenario: Visitante vê a apresentação
- **WHEN** alguém sem sessão acessa `/`
- **THEN** vê a landing com a proposta do produto e os botões de cadastro e login

#### Scenario: Logado pula a landing
- **WHEN** um usuário autenticado acessa `/`
- **THEN** é redirecionado ao `/dashboard`
