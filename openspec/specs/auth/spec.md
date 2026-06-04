# auth Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Sessão via cookies com SSR
O sistema SHALL autenticar usuários via Supabase Auth usando `@supabase/ssr`, mantendo a sessão por cookies acessível em Server Components, Server Actions e middleware.

#### Scenario: Sessão disponível no servidor
- **WHEN** um usuário autenticado requisita uma página renderizada no servidor
- **THEN** a identidade do usuário está disponível a partir dos cookies de sessão

### Requirement: Proteção de rotas administrativas
O sistema SHALL usar middleware para exigir sessão válida em rotas administrativas — incluindo a página de atualização de senha — redirecionando usuários não autenticados.

#### Scenario: Não autenticado bloqueado
- **WHEN** um visitante sem sessão acessa uma rota protegida
- **THEN** ele é redirecionado para a tela de login

#### Scenario: Autenticado autorizado
- **WHEN** um usuário com sessão válida acessa a rota protegida
- **THEN** o acesso é concedido

#### Scenario: Atualização de senha exige sessão
- **WHEN** um visitante sem sessão acessa a página de atualização de senha
- **THEN** ele é redirecionado para a tela de login

### Requirement: Login via Server Actions
O sistema SHALL implementar login usando os métodos nativos do Supabase Auth através de Server Actions, sem rotas HTTP tradicionais.

#### Scenario: Login bem-sucedido
- **WHEN** credenciais válidas são submetidas
- **THEN** a sessão é criada e o usuário é redirecionado à área autenticada

### Requirement: Cadastro de conta
O sistema SHALL permitir cadastro self-service via Server Action: nome, e-mail, celular brasileiro e senha, validados com Zod antes de qualquer chamada ao Supabase. O cadastro SHALL enviar `nome` e `celular` como metadata do Auth, de onde o trigger de banco cria o perfil público — sem INSERT direto em `users` pela aplicação. As mensagens NÃO SHALL revelar se o e-mail já possui conta (anti-enumeração).

#### Scenario: Cadastro com confirmação de e-mail pendente
- **WHEN** um visitante submete cadastro válido e o projeto exige confirmação de e-mail
- **THEN** a action responde com instrução para conferir o e-mail, sem criar sessão

#### Scenario: Cadastro com confirmação desligada
- **WHEN** um visitante submete cadastro válido e o Supabase retorna sessão imediata
- **THEN** o usuário é redirecionado à área autenticada

#### Scenario: Entrada inválida não toca o Supabase
- **WHEN** o cadastro é submetido com campos inválidos (e-mail malformado, celular fora do padrão BR, senha curta)
- **THEN** a action retorna os erros por campo e nenhuma chamada ao Supabase é feita

#### Scenario: E-mail já cadastrado não é revelado
- **WHEN** o cadastro é submetido com um e-mail que já possui conta
- **THEN** a resposta é indistinguível do cadastro bem-sucedido

### Requirement: Recuperação de senha
O sistema SHALL oferecer recuperação de senha em duas etapas via Server Actions: solicitação (envio de link por e-mail) e atualização (nova senha sobre a sessão de recovery). A solicitação SHALL responder com a MESMA mensagem de sucesso exista ou não a conta (anti-enumeração). A atualização SHALL exigir sessão válida e validar a nova senha com confirmação.

#### Scenario: Solicitação sempre responde igual
- **WHEN** a recuperação é solicitada para qualquer e-mail bem-formado (com ou sem conta, com ou sem erro interno)
- **THEN** a resposta ao cliente é a mesma mensagem neutra de sucesso

#### Scenario: Senha atualizada com sessão de recovery
- **WHEN** o usuário chega autenticado pelo link de recovery e submete nova senha válida (com confirmação igual)
- **THEN** a senha é atualizada e o usuário é redirecionado à área autenticada

#### Scenario: Atualização sem sessão é rejeitada
- **WHEN** a action de atualização é invocada sem sessão válida
- **THEN** a action rejeita com orientação para solicitar novo link, sem alterar senha alguma

### Requirement: Confirmação por link de e-mail
O sistema SHALL expor um endpoint GET de confirmação (`/auth/confirm`) que troca o token do link de e-mail por sessão: caminho primário `token_hash` + `type` via `verifyOtp`; fallback `code` via `exchangeCodeForSession`. Este endpoint é exceção registrada à regra "mutações só via Server Actions": é um callback de navegação iniciado pelo cliente de e-mail, sem origem em formulário da aplicação. O destino pós-confirmação (`next`) SHALL ser validado como caminho interno (anti open-redirect). Falhas SHALL redirecionar ao login com aviso, sem vazar detalhes.

#### Scenario: Link válido cria sessão e redireciona
- **WHEN** o usuário abre um link de e-mail com `token_hash` e `type` válidos
- **THEN** a sessão é criada e ele é redirecionado ao destino interno indicado em `next`

#### Scenario: Destino externo é neutralizado
- **WHEN** o link contém `next` apontando para fora da aplicação — URL absoluta, prefixo `//`, barra invertida (`/\`, que o parser trata como `/`) ou caractere de controle que mascare `//`
- **THEN** o redirecionamento usa o destino padrão interno

#### Scenario: Link inválido ou expirado
- **WHEN** o token do link não pode ser verificado
- **THEN** o usuário é redirecionado ao login com aviso de link inválido

