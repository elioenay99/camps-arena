# app-shell — Delta Spec

## ADDED Requirements

### Requirement: Estados de erro e ausência vestidos com a identidade

As telas de erro de rota e de conteúdo inexistente SHALL ser apresentadas no
idioma visual da identidade dentro do shell autenticado — cartão com elevação
(`.elevate`), entrada suave (`animate-rise`),
chip de ícone (tom destrutivo no erro, tom do primário na ausência) e título em
tipografia display — reaproveitando um componente presentacional compartilhado,
SEM alterar o comportamento (retry/`unstable_retry`, log de `console.error` no
servidor, código de erro `digest`, navegação "Voltar ao painel") nem vazar
detalhes internos ao usuário. O contraste SHALL atender WCAG AA nos dois temas.
O boundary de ÚLTIMO recurso (`global-error`) SHALL permanecer com estilos inline
independentes do CSS do app (sem reaproveitar o design system), por robustez.

#### Scenario: Erro de rota vestido com a identidade

- **WHEN** uma página autenticada falha e cai no error boundary
- **THEN** aparece o cartão de erro com ícone, título em display, mensagem
  amigável e o botão "Tentar novamente" (com o código do erro quando houver),
  sem expor detalhes internos

#### Scenario: Conteúdo inexistente vestido com a identidade

- **WHEN** o usuário acessa um torneio inexistente ou sem acesso
- **THEN** aparece o cartão de ausência (tom neutro) com "Voltar ao painel",
  no mesmo idioma visual

#### Scenario: Último recurso permanece robusto

- **WHEN** o erro escapa até o `global-error` (falha do próprio layout/CSS)
- **THEN** ele renderiza com estilos inline, sem depender do design system do app
