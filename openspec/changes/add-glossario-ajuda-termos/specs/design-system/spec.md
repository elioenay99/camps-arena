## ADDED Requirements

### Requirement: Primitivo de Popover acessível

O design system SHALL fornecer um primitivo de `Popover` reutilizável, construído
como wrapper shadcn sobre o `Popover` do pacote `radix-ui` (já instalado), sem
adicionar dependência nova. O primitivo SHALL expor `Popover`, `PopoverTrigger`,
`PopoverContent` e `PopoverAnchor`. O conteúdo SHALL abrir por **clique/toque** e
por **teclado** (`Enter`/`Espaço` no gatilho) — NÃO por `hover`, já que o uso é
mobile-first e `hover` não existe no toque. O gatilho SHALL expor
`aria-haspopup` e `aria-expanded` (herdados do Radix), o foco SHALL ser gerenciado
pelo Radix, e o conteúdo SHALL fechar por `Esc` e por clique-fora. O
`PopoverContent` SHALL usar os tokens `--popover`/`--popover-foreground`, com
contraste WCAG AA nos DOIS temas (Dracula no escuro, Canarinho no claro), e SHALL
ser renderizado em portal com as animações de entrada/saída padrão do shadcn.

#### Scenario: Popover abre por clique/toque

- **WHEN** um usuário aciona o gatilho de um Popover por clique ou toque
- **THEN** o conteúdo do Popover é exibido e o gatilho passa a expor
  `aria-expanded="true"`

#### Scenario: Popover operável por teclado e leitor de tela

- **WHEN** um usuário navega até o gatilho por teclado e o aciona (`Enter`/`Espaço`)
- **THEN** o conteúdo abre com foco gerenciado, o gatilho expõe
  `aria-haspopup`/`aria-expanded`, e `Esc` fecha o Popover

#### Scenario: Popover respeita os temas

- **WHEN** o Popover é exibido no tema escuro (Dracula) e no claro (Canarinho)
- **THEN** o conteúdo usa `--popover`/`--popover-foreground` com contraste AA em
  ambos os temas
