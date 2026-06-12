# design-system — Delta Spec

## ADDED Requirements

### Requirement: Apresentação da tela de conta

A tela de Conta SHALL aplicar o idioma visual do design system: cada seção
(perfil, alterar senha) SHALL ter um cabeçalho com ícone em destaque e título em
tipografia de display, o avatar SHALL ter um realce sutil, e os cards SHALL ocupar
a largura do conteúdo de forma coerente. A apresentação SHALL ser operável no
viewport de celular (390px) e NÃO SHALL alterar o `UserAvatar`, os formulários
(nomes dos campos, validação) nem as ações de perfil/avatar/senha.

#### Scenario: Seções com cabeçalho iconado

- **WHEN** a tela de conta é aberta
- **THEN** as seções de perfil e de alterar senha mostram um ícone em destaque e o
  título em tipografia de display

#### Scenario: Apresentação não altera comportamento

- **WHEN** o usuário edita o perfil, troca o avatar ou altera a senha
- **THEN** o comportamento (ações, nomes de campo, validação, UserAvatar) permanece
  como antes, apenas com a nova moldura visual
