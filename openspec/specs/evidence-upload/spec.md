# evidence-upload Specification

## Purpose
TBD - created by archiving change harden-upload-evidencia. Update Purpose after archive.
## Requirements
### Requirement: Upload de evidência valida o tipo pelo conteúdo real

O upload de evidência de resultado SHALL validar o tipo do arquivo pela sua assinatura de
bytes reais (magic bytes), não apenas pelo MIME declarado pelo cliente. O sistema SHALL
aceitar somente PNG, JPEG e WEBP, identificados por:

- PNG: `89 50 4E 47 0D 0A 1A 0A`
- JPEG: `FF D8 FF`
- WEBP: `52 49 46 46` (RIFF) nos bytes 0–3 **e** `57 45 42 50` (WEBP) nos bytes 8–11

Se o conteúdo não corresponder a um tipo do allowlist, OU se o tipo detectado divergir do
MIME declarado, o upload SHALL ser rejeitado com mensagem clara. O `contentType` enviado ao
Storage SHALL derivar do tipo DETECTADO, não do declarado pelo cliente. A detecção SHALL
ser uma função pura exportada, testável sem I/O.

O upload SHALL preservar as garantias já existentes: bucket privado, path
`<uid>/<matchId>/<rand>.<ext>` construído no servidor, limite de 5MB e a assinatura pública
de `subirEvidencia`.

#### Scenario: Imagem legítima é aceita
- **WHEN** um usuário anexa um PNG/JPEG/WEBP cujo conteúdo bate com o MIME declarado
- **THEN** o upload prossegue e o arquivo é salvo com o `contentType` do tipo detectado

#### Scenario: Arquivo com conteúdo fora do allowlist é rejeitado
- **WHEN** o conteúdo do arquivo não é PNG, JPEG nem WEBP (ex.: bytes arbitrários ou um SVG renomeado)
- **THEN** o upload é rejeitado com erro claro, sem enviar nada ao Storage

#### Scenario: MIME mentido não passa
- **WHEN** o arquivo declara um MIME do allowlist mas seu conteúdo real é de outro tipo
- **THEN** o upload é rejeitado porque o tipo detectado não corresponde ao declarado

### Requirement: Upload de evidência remove EXIF do JPEG antes de persistir

O upload de evidência SHALL remover os segmentos `APP1` (marcador `FF E1`, que carrega EXIF/XMP) dos arquivos JPEG antes de enviá-los ao Storage, por privacidade — fotos de câmera embutem metadados EXIF, incluindo coordenadas de GPS. A remoção não SHALL reprocessar/re-encodar a imagem. A remoção SHALL ser uma função pura exportada
`removerExifJpeg(bytes)` que preserva o marcador SOI, os demais segmentos e os dados de
scan, e devolve entrada não-JPEG intacta. PNG e WEBP não têm strip nesta capability (escopo
consciente: GPS de câmera vem quase sempre em JPEG).

#### Scenario: JPEG com EXIF sobe sem o segmento APP1
- **WHEN** um JPEG contendo um segmento `APP1` (EXIF) é enviado como evidência
- **THEN** os bytes persistidos no Storage não contêm o segmento `APP1`, mantendo o restante da imagem intacto e ainda começando por `FF D8`

#### Scenario: JPEG sem EXIF é preservado
- **WHEN** um JPEG sem nenhum segmento `APP1` é enviado
- **THEN** os bytes persistidos são equivalentes aos originais (nada a remover)

#### Scenario: Função de strip ignora tipos não-JPEG
- **WHEN** `removerExifJpeg` recebe bytes que não começam por `FF D8`
- **THEN** ela devolve os bytes inalterados

