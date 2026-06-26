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
O sistema SHALL permitir cadastro self-service via Server Action: nome, e-mail, **celular
(brasileiro ou internacional)** e senha, validados com Zod antes de qualquer chamada ao
Supabase. O celular SHALL ser validado por país com `libphonenumber-js` e **normalizado para
E.164** (`+<DDI><numero>`) antes de qualquer gravação; uma entrada nacional sem DDI SHALL
assumir o Brasil (retrocompatível com os números BR de 11 dígitos). O cadastro SHALL enviar
`nome` e `celular` (E.164) como metadata do Auth, de onde o trigger de banco cria o perfil
público — sem INSERT direto em `users` pela aplicação. As mensagens NÃO SHALL revelar se o
e-mail já possui conta (anti-enumeração).

#### Scenario: Cadastro com confirmação de e-mail pendente
- **WHEN** um visitante submete cadastro válido e o projeto exige confirmação de e-mail
- **THEN** a action responde com instrução para conferir o e-mail, sem criar sessão

#### Scenario: Cadastro com confirmação desligada
- **WHEN** um visitante submete cadastro válido e o Supabase retorna sessão imediata
- **THEN** o usuário é redirecionado à área autenticada

#### Scenario: Celular internacional é aceito e normalizado
- **WHEN** um visitante seleciona o país (ex.: Portugal) e informa um celular válido daquele país
- **THEN** o cadastro é aceito e o celular é gravado em E.164 (ex.: `+351931482194`)

#### Scenario: Celular brasileiro segue válido
- **WHEN** um visitante mantém o país padrão (Brasil) e informa um celular BR válido
- **THEN** o cadastro é aceito e o celular é gravado em E.164 (`+55<DDD><numero>`)

#### Scenario: Entrada inválida não toca o Supabase
- **WHEN** o cadastro é submetido com campos inválidos (e-mail malformado, celular inválido para o país selecionado, senha curta)
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

### Requirement: Alteração de senha pelo usuário autenticado

O usuário AUTENTICADO SHALL poder trocar a própria senha dentro do app, sem o
fluxo de recuperação por e-mail, em uma rota protegida do painel
(`/dashboard/conta`). A action `alterarSenha` SHALL exigir a senha ATUAL e
re-autenticar (`signInWithPassword`) antes de gravar a nova (`updateUser`); a
nova senha SHALL ter no mínimo 6 caracteres, coincidir com a confirmação e ser
diferente da atual. Em sucesso, SHALL confirmar inline (sem redirect); falha de
senha atual SHALL retornar erro no campo da senha atual, sem gravar a nova.

#### Scenario: Troca com senha atual correta

- **WHEN** o usuário informa a senha atual correta e uma nova senha válida
- **THEN** a senha é atualizada e o app confirma a troca sem deslogar

#### Scenario: Senha atual incorreta

- **WHEN** o usuário informa uma senha atual incorreta
- **THEN** a troca é negada com erro no campo da senha atual e a senha NÃO muda

#### Scenario: Nova senha igual à atual

- **WHEN** a nova senha é igual à atual
- **THEN** a validação rejeita antes de qualquer chamada ao Supabase

### Requirement: Edição do próprio perfil

O usuário AUTENTICADO SHALL editar o próprio nome e celular em
`/dashboard/conta`. A action `atualizarPerfil` SHALL validar (nome ≥ 2, celular **válido para
o país e normalizado para E.164**) e gravar apenas sobre a linha de `public.users` do
próprio usuário (`id = auth.uid()`); nunca a de outro. Um perfil legado com celular nacional
BR (sem DDI) SHALL abrir com o país Brasil pré-selecionado.

#### Scenario: Atualiza nome e celular

- **WHEN** o usuário salva nome e celular válidos
- **THEN** `public.users` do próprio usuário é atualizado (celular em E.164) e o app confirma

#### Scenario: Celular inválido é rejeitado

- **WHEN** o celular não é válido para o país selecionado
- **THEN** a validação rejeita sem gravar

### Requirement: Foto de perfil do usuário

O usuário AUTENTICADO SHALL enviar, trocar e remover a própria foto de perfil.
A action `atualizarAvatar` SHALL aceitar apenas imagem dentro do limite de
tamanho, enviá-la ao bucket `avatars` na pasta do próprio usuário e gravar a URL
pública em `public.users.avatar`; `removerAvatar` SHALL apagar o arquivo e zerar
a coluna. Uploads SHALL respeitar a RLS de storage (cada um só na própria pasta).

#### Scenario: Envia uma foto válida

- **WHEN** o usuário envia uma imagem dentro do limite
- **THEN** a foto vai para `avatars/<uid>/…` e `users.avatar` recebe a URL

#### Scenario: Arquivo não-imagem ou grande demais

- **WHEN** o arquivo não é imagem ou excede o limite
- **THEN** o upload é recusado e `users.avatar` não muda

### Requirement: Mensagens de erro acionáveis no cadastro

Quando o `signUp` do Supabase falha, a action de cadastro SHALL traduzir o erro em mensagem
acionável (pt-BR) conforme a causa, em vez de uma única mensagem genérica, **sem revelar se o
e-mail já possui conta** (mantém a anti-enumeração do requisito "Cadastro de conta"):

- Limite de envio de e-mail (`over_email_send_rate_limit` ou HTTP 429) SHALL produzir uma
  mensagem dedicada que NÃO atribui culpa ao usuário e orienta tentar de novo em alguns minutos.
- Senha recusada pela política (`weak_password`) SHALL produzir erro no campo **senha**.
- E-mail recusado (`email_address_invalid`) SHALL produzir erro no campo **e-mail**.
- Qualquer outra falha (incluindo e-mail já cadastrado) SHALL cair na mensagem genérica.

#### Scenario: Limite de e-mail não culpa o usuário

- **WHEN** o `signUp` falha com `over_email_send_rate_limit` (ou status 429)
- **THEN** a action responde com mensagem de "muitos cadastros agora, tente em alguns minutos",
  sem erro por campo

#### Scenario: Senha fraca é apontada no campo

- **WHEN** o `signUp` falha com `weak_password`
- **THEN** a action responde com erro associado ao campo senha

#### Scenario: E-mail inválido é apontado no campo

- **WHEN** o `signUp` falha com `email_address_invalid`
- **THEN** a action responde com erro associado ao campo e-mail

#### Scenario: Falha desconhecida mantém o genérico e a anti-enumeração

- **WHEN** o `signUp` falha por outra causa (ex.: e-mail já cadastrado)
- **THEN** a action responde com a mensagem genérica, sem revelar a existência da conta

