## ADDED Requirements

### Requirement: Menu de conta no avatar do header
O header do dashboard SHALL expor um MENU ancorado no avatar do usuário logado
(substituindo o link único para a Conta), com três itens: "Meu perfil de técnico"
(navega para `/dashboard/ligas/tecnico/{auth.uid()}`), "Conta" (navega para
`/dashboard/conta`) e "Sair" (executa a server action de logout). O botão "Sair"
SHALL migrar do header solto para dentro desse menu; o alternador de tema SHALL
permanecer no header. O gatilho SHALL ter rótulo acessível e alvo de toque de 44px,
os itens SHALL ser navegáveis por teclado e o menu SHALL fechar por Escape ou clique
fora. O menu SHALL usar o componente Popover já existente, sem adicionar dependência
nova. Nenhuma mudança de dados, rota de destino (além da nova rota de perfil) ou
permissão SHALL ser introduzida.

#### Scenario: Avatar abre o menu de conta
- **WHEN** o usuário logado clica no avatar do header
- **THEN** abre um menu com "Meu perfil de técnico", "Conta" e "Sair"

#### Scenario: Meu perfil de técnico leva ao próprio perfil
- **WHEN** o usuário escolhe "Meu perfil de técnico"
- **THEN** navega para `/dashboard/ligas/tecnico/{seu próprio id}`

#### Scenario: Sair executa o logout de dentro do menu
- **WHEN** o usuário escolhe "Sair" no menu
- **THEN** a server action de logout é executada (o botão solto de "Sair" não existe mais no header)

#### Scenario: Menu acessível e fechável
- **WHEN** o menu está aberto
- **THEN** os itens são focáveis por teclado e o menu fecha ao pressionar Escape ou clicar fora
