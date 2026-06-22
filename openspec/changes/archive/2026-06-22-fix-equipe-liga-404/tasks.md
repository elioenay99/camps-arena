## 1. Correção

- [x] 1.1 `ligas/[id]/equipe/page.tsx`: resolver via `getSeason(id, user.id)` (gate GERIR + season→competição) e usar `temporada.competicao.id` como `competitionId` em getMembros/getConvitesMembro/TeamSection/MemberInviteCards/AddMemberSearch.
- [x] 1.2 Dono/nome de `temporada.competicao` (`criadaPor`/`nome`); remover o gate `podeGerir({competitionId:id})` e a query `league_competitions` por id da temporada.

## 2. Gates de qualidade

- [x] 2.1 `pnpm typecheck && pnpm lint && pnpm build` verdes (rota compila).
- [x] 2.2 Fix provado por construção: espelha a página de Identidade (cores) que já resolve season→competição via `getSeason` e funciona. Confirmação ao vivo no browser agendada (stack subindo) + o dono confirma na liga real pós-deploy.

## 3. Arquivar

- [x] 3.1 `openspec archive fix-equipe-liga-404`; commit (pt-BR, sem coautoria); push; derrubar Docker.
