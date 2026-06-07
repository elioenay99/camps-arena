# app-shell Specification

## Purpose
TBD - created by archiving change add-app-nav-e-landing. Update Purpose after archive.
## Requirements
### Requirement: Navegação autenticada persistente
Toda página autenticada SHALL compartilhar um shell com header persistente contendo: a marca (wordmark em tipografia display, linkando para `/dashboard`), a navegação principal com indicação visual da rota ativa (pill do primário; `/dashboard` ativa por igualdade exata, demais por prefixo, com `aria-current`), o alternador de tema e a saída da conta. O header SHALL ser fixo no scroll (sticky) com fundo translúcido (backdrop-blur).

#### Scenario: Navegação visível em todas as páginas autenticadas
- **WHEN** o usuário navega entre dashboard, torneios e demais páginas autenticadas
- **THEN** o header persiste com a marca, os links (ativo destacado com aria-current), o tema e o sair

#### Scenario: Item ativo correto
- **WHEN** o usuário está em uma sub-rota (ex.: /dashboard/torneios/abc)
- **THEN** o item "Torneios" aparece como ativo (prefixo), e "/dashboard" só quando a rota é exatamente ela

### Requirement: Landing pública na raiz
A rota `/` SHALL apresentar o sistema a visitantes (proposta de valor e destaques) com chamadas para "Criar conta" (`/cadastro`) e "Entrar" (`/login`), vestindo a identidade "Estádio à noite": hero em tipografia display com destaque de marca, um PREVIEW do produto renderizado em HTML com os estilos reais (mini-classificação com 1º lugar dourado), e destaques com ícones. Usuário autenticado que acessa `/` SHALL ser redirecionado ao `/dashboard`.

#### Scenario: Visitante vê a apresentação
- **WHEN** alguém sem sessão acessa `/`
- **THEN** vê a landing com a proposta do produto, o preview visual e os botões de cadastro e login

#### Scenario: Logado pula a landing
- **WHEN** um usuário autenticado acessa `/`
- **THEN** é redirecionado ao `/dashboard`

