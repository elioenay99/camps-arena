# Tasks — simplify-criar-torneio

## 1. Seletor de formato em cards

- [x] 1.1 `formatoMeta.ts`: `desc` curta por formato.
- [x] 1.2 `TournamentForm`: `FormatoCard` (label + radio `name="formato"`, ícone,
      nome, desc; selecionado destacado; foco via `has-[:focus-visible]`); grid.

## 2. Revelação progressiva

- [x] 2.1 Painel competitivo (`animate-rise`) com Clubes + Ida/volta + 3º lugar;
      Pontos por resultado SÓ em liga/grupos/fase de liga. Avulso = mínimo.
- [x] 2.2 Página mais larga (`max-w-xl`) + `.elevate`; opções como linhas-checkbox.

## 3. Validação

- [x] 3.1 Gates: typecheck/lint/test (848 ✅) + build.
- [x] 3.2 Ao vivo (Playwright): avulso, liga, mata-mata — disclosure correto por
      formato (pontos só onde há tabela). Contrato do form preservado.
- [ ] 3.3 Commit + push + CI verde + archive.
