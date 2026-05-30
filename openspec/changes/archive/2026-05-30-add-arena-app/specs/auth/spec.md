## ADDED Requirements

### Requirement: Sessão via cookies com SSR
O sistema SHALL autenticar usuários via Supabase Auth usando `@supabase/ssr`, mantendo a sessão por cookies acessível em Server Components, Server Actions e middleware.

#### Scenario: Sessão disponível no servidor
- **WHEN** um usuário autenticado requisita uma página renderizada no servidor
- **THEN** a identidade do usuário está disponível a partir dos cookies de sessão

### Requirement: Proteção de rotas administrativas
O sistema SHALL usar middleware para exigir sessão válida em rotas administrativas, redirecionando usuários não autenticados.

#### Scenario: Não autenticado bloqueado
- **WHEN** um visitante sem sessão acessa uma rota protegida
- **THEN** ele é redirecionado para a tela de login

#### Scenario: Autenticado autorizado
- **WHEN** um usuário com sessão válida acessa a rota protegida
- **THEN** o acesso é concedido

### Requirement: Login via Server Actions
O sistema SHALL implementar login usando os métodos nativos do Supabase Auth através de Server Actions, sem rotas HTTP tradicionais.

#### Scenario: Login bem-sucedido
- **WHEN** credenciais válidas são submetidas
- **THEN** a sessão é criada e o usuário é redirecionado à área autenticada
