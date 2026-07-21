# Tasks — mobile-nomes-legiveis

## 1. Fluxo de temporada (prioridade máxima)

- [x] 1.1 `FluxoTemporadaPanel.tsx` — `LinhaCompetidor` em duas faixas no mobile:
      (posição + escudo + NOME) em cima, (setas + pílulas) embaixo; `sm:` volta à linha única
- [x] 1.2 Setas subir/descer com `gap-1.5` no mobile, `md:gap-0` no desktop
- [x] 1.3 Chips Playoff/Sorteio/Ajuste com significado em texto visível no mobile
      (`title` preservado para o desktop)

## 2. Listas de identidade

- [x] 2.1 `TeamSection.tsx` — cluster (papel + remover) sai da linha do nome no mobile
- [x] 2.2 `MuralhaRanking.tsx` — badge de clean sheets em faixa própria; garantir que
      "em N jogos" sobreviva
- [x] 2.3 `EdicaoParticipantesPanel.tsx` — controles de reordenação saem da linha do nome;
      linha de origem legível

## 3. Vitrine (produção + demo, coerentes)

- [x] 3.1 `app/dashboard/explorar/page.tsx` — `StatusPill` desce no mobile; nome e
      "por Fulano" sobrevivem
- [x] 3.2 `CardVitrineDemo.tsx` — solução equivalente à de produção

## 4. Painéis gêmeos de confronto

- [x] 4.1 `ConfrontoDiretoPanel.tsx` — 3-up empilha no mobile
- [x] 4.2 `ConfrontoTecnicosPanel.tsx` — MESMO diff (espelho)
- [x] 4.3 Hierarquia: número de empates com o mesmo peso dos números das pontas, nos dois

## 5. Mata-mata

- [x] 5.1 `IniciarMataMataPanel.tsx` — selects de confronto empilham no mobile
      (`minmax(0,1fr)` em `sm:`), sem apertar a altura ganha no anti-zoom do iOS

## 6. Testes

- [x] 6.1 Atualizar testes irmãos afetados pela mudança de estrutura
- [x] 6.2 Adicionar cobertura: separação das setas, chip com texto visível, sobrevivência
      da linha secundária

## 7. Gate

- [x] 7.1 `openspec validate mobile-nomes-legiveis --strict` = valid
- [x] 7.2 `pnpm typecheck` verde
- [x] 7.3 `pnpm lint` verde
- [x] 7.4 Subset de testes afetados com `--maxWorkers=2` verde
- [x] 7.5 Commit pt-BR, Conventional Commits, sem coautoria de IA, sem push
