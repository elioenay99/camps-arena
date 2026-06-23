## ADDED Requirements

### Requirement: Redação de e-mail na telemetria

O sistema SHALL redigir endereços de e-mail antes de enviar eventos de telemetria (Sentry),
cobrindo `message`, `extra` e `breadcrumbs`, além da redação já existente de telefone e wa.me.

#### Scenario: E-mail em mensagem de erro é redigido

- **WHEN** um evento de telemetria contém um endereço de e-mail no texto da mensagem ou em campos auxiliares
- **THEN** o e-mail é substituído por um marcador de redação antes do envio
