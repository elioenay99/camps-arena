# Tasks — polish-match-modal

## 1. Apresentação (lógica/contrato preservados)

- [x] 1.1 Cabeçalho: título em `font-display font-bold`; eyebrow "MENU DA PARTIDA"
      mantido; subtítulo/descrição preservados.
- [x] 1.2 Caixa do placar com `.elevate` + rótulo "Lançar placar" eyebrow; número
      do placar em `font-display` (tabular-nums mantido).
- [x] 1.3 SALVAR PLACAR → botão PRIMARY (default), sentence-case; FECHAR → outline
      sentence-case. WhatsApp segue `bg-green-700` (afordância da marca).
- [x] 1.4 Mobile-first 390px: 2 colunas com gaps/truncamento/alvos de toque.

## 2. Validação

- [x] 2.1 Gates: typecheck / lint / test (MatchScoreModal 3/3 + suíte 848) / build.
- [x] 2.2 Ao vivo (Playwright): modal aberto (avulso e competitivo com clube/técnico/
      WhatsApp) nos 2 temas (Dracula/Canarinho) + 390px.
- [x] 2.3 Workflow adversarial (16 confirmados, approved_with_nits, 0 must_fix);
      fixes aplicados (steppers 40px p/ toque no mobile; remove text-base/font-semibold
      do salvar p/ casar o CTA primário; ordem de classes da eyebrow). Descartados com
      motivo: verde-no-verde (regra de marca WhatsApp; já melhorado), DialogFooter
      (override necessário), tracking/contraste pré-existentes. Revalidado 390px.
