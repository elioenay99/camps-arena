# competition-roles — Delta Spec

## ADDED Requirements

### Requirement: Perfis de equipe do campeonato

Um campeonato (torneio ou pirâmide de ligas) SHALL suportar, além do **dono**
(`created_by`), uma **equipe** de membros, cada um com exatamente um **papel** por
campeonato: `admin`, `arbitro` ou `moderador`. Os papéis concedem **capacidades**
ortogonais: **gerir** (dono | admin), **arbitrar** (dono | admin | árbitro) e **moderar**
(dono | admin | moderador). O dono SHALL manter todas as capacidades e ser o único com
poder de **apagar** e **reabrir/reiniciar** o campeonato. O admin SHALL ter as três
capacidades EXCETO apagar e reabrir/reiniciar.

#### Scenario: Admin faz o dia-a-dia mas não reabre nem apaga

- **WHEN** um admin opera um torneio
- **THEN** pode iniciar/avançar fases, lançar placar, marcar W.O., liberar rodadas, gerir
  vagas/convites, encerrar o torneio e gerir a equipe
- **AND** NÃO pode reabrir um torneio encerrado nem apagar o campeonato (negado em policy/
  trigger, não só na UI)

#### Scenario: Árbitro só opera jogos

- **WHEN** um árbitro acessa o campeonato
- **THEN** pode lançar/corrigir placar, marcar W.O., fechar e liberar rodadas
- **AND** NÃO vê nem executa ações de estrutura (iniciar/avançar fase), config ou convites

#### Scenario: Moderador só cuida de pessoas

- **WHEN** um moderador acessa o campeonato
- **THEN** pode gerar/gerir convites, preencher e expulsar vagas e remover participantes
- **AND** NÃO pode lançar placar nem mexer na estrutura

### Requirement: Herança de papéis da liga aos torneios das divisões

Os membros de uma pirâmide (`league_members`) SHALL herdar sua capacidade sobre TODOS os
torneios das divisões dessa pirâmide (apertura, clausura, grande final, playoff e
barragem), mapeados por `liga_do_torneio`. Membros de um torneio avulso/competitivo
(`tournament_members`) SHALL ter capacidade apenas sobre aquele torneio.

#### Scenario: Admin de liga opera a divisão

- **WHEN** um admin de uma pirâmide abre o torneio de uma divisão (apertura ou clausura)
- **THEN** pode operá-lo conforme a capacidade de admin (tudo menos reabrir/apagar),
  mesmo não sendo `created_by` do torneio

#### Scenario: Membro de torneio não vaza para outro

- **WHEN** alguém é admin do torneio X
- **THEN** não recebe nenhuma capacidade sobre o torneio Y nem sobre pirâmides

### Requirement: Convite de equipe por link e por busca

A inclusão de um membro SHALL ocorrer por (a) **link de convite por papel** — código
secreto e regenerável por `(campeonato, papel)`, **apenas para árbitro/moderador**, aceito
via RPC `aceitar_convite_membro` — ou (b) **busca de usuário por nome** + adição direta. O
papel **admin** SHALL ser concedido **exclusivamente por adição direta do dono** (sem
link), por ser dono-only. A busca SHALL retornar apenas dados públicos (nome, avatar, id
via `users_public`), exigir mínimo de caracteres e nunca expor PII (celular/email). Quem
for adicionado SHALL ser notificado e SHALL poder **sair da equipe** por conta própria.

#### Scenario: Não há link de convite para admin

- **WHEN** alguém tenta gerar um link de convite de equipe para o papel admin
- **THEN** é recusado — admin entra só por adição direta do dono

#### Scenario: Aceite por link concede o papel

- **WHEN** uma pessoa logada abre um link de convite de equipe válido e confirma
- **THEN** vira membro com o papel do convite (ou tem o papel atualizado se já era membro)
- **AND** se já for o dono, nada muda (dono não vira membro)

#### Scenario: Adição direta por busca notifica e é reversível

- **WHEN** um gestor busca uma pessoa por nome e a adiciona como árbitro
- **THEN** ela passa a ter a capacidade arbitrar e recebe uma notificação
- **AND** pode sair da equipe quando quiser

#### Scenario: Busca não vaza PII

- **WHEN** qualquer usuário busca pessoas para convidar
- **THEN** vê apenas nome, avatar e id — nunca celular ou email

### Requirement: Gestão da equipe — admin gere perfis menores, dono gere admins

A equipe SHALL ser gerida pelo dono e pelos admins (capacidade gerir), MAS
**criar/promover/remover um admin SHALL ser dono-only**: admins gerem apenas árbitros e
moderadores (convidar, adicionar por busca, remover). O dono SHALL ser imutável (nunca
removível, anti-lockout) por nunca constar como membro. Qualquer membro SHALL poder
**sair** voluntariamente, e remover/sair SHALL ser idempotente (0 linhas = sucesso).

#### Scenario: Admin gere árbitros e moderadores, mas não cria outro admin

- **WHEN** um admin adiciona ou remove um árbitro ou moderador
- **THEN** a operação é aceita
- **AND** ao tentar promover alguém a admin (ou gerar link de admin), é recusado — só o
  dono cria admins

#### Scenario: Dono é imutável e sair é sempre permitido

- **WHEN** alguém tenta remover o dono
- **THEN** é impossível (o dono não é membro; não há linha)
- **WHEN** um membro opta por sair da equipe
- **THEN** sua linha é removida e ele perde as capacidades, sem depender de outro gestor
