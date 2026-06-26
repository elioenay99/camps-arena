# auth — Delta Spec

## MODIFIED Requirements

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
