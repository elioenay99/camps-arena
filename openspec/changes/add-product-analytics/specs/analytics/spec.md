# analytics — Delta Spec

## ADDED Requirements

### Requirement: Medição de audiência e Web Vitals via Vercel

A aplicação SHALL coletar audiência (page views) e Web Vitals do usuário via
Vercel Analytics e Speed Insights, sem cookies e sem credencial. A coleta SHALL
ocorrer apenas em produção no Vercel (no-op em desenvolvimento e fora do Vercel).
A instrumentação SHALL ser compatível com a CSP estrita existente — os scripts
são injegados pelo bundle confiável (autorizados por `strict-dynamic`) e os
beacons são same-origin — sem introduzir nova origem nem afrouxar a política.

#### Scenario: Coleta ativa em produção

- **WHEN** a aplicação roda em produção no Vercel
- **THEN** page views e Web Vitals são enviados aos endpoints same-origin do Vercel

#### Scenario: No-op em desenvolvimento

- **WHEN** a aplicação roda localmente
- **THEN** nada é coletado e o app funciona normalmente, sem violação de CSP
