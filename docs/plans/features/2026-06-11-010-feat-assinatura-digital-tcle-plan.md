---
title: "feat: Assinatura eletrônica de TCLE e contratos"
type: feat
status: planned
date: 2026-06-11
slug: assinatura-digital-tcle
priority: 7
complexity: L
depends_on:
  - gerador-documentos-cfp (plano 2026-06-11-009 — modelo GeneratedDocument; ver §3.0)
---

# feat: Assinatura eletrônica de TCLE e contratos

Enviar qualquer documento gerado (TCLE, contrato terapêutico, consentimento para
menores, termo LGPD) para assinatura eletrônica **avançada** (Lei 14.063/2020,
MP 2.200-2/2001 art. 10 §2º) do paciente/responsável, com prova de posse por OTP,
trilha de auditoria completa, PDF final carimbado com página de evidências e
verificação pública de integridade por código — tudo implementado em código, sem
provedores externos de assinatura.

---

## 1. Contexto de Negócio

### Problema

- A **LGPD** exige consentimento documentado para tratamento de dados sensíveis
  (dados de saúde). Hoje o Clinica só guarda **booleans** de consentimento
  (`Patient.consentWhatsApp`, `consentPhotoVideo`, `consentSessionRecording` etc.)
  preenchidos pelo staff — sem prova de quem consentiu, quando, nem do texto
  consentido.
- A **Resolução CFP 09/2024** torna obrigatório o **contrato escrito** para
  atendimento psicológico online. Clínicas que atendem online sem contrato
  assinado estão em desconformidade ética.
- Um contrato terapêutico assinado é também a base aceita pelo CFP para **cobrar
  faltas e cancelamentos tardios** — dor financeira direta das clínicas.
- O fluxo atual é artesanal: imprimir/enviar PDF por WhatsApp → paciente imprime,
  assina, fotografa → secretaria arquiva a foto. Nada disso gera evidência forte
  nem fica vinculado ao prontuário.

### Modelo legal implementado

**Assinatura eletrônica avançada** (Lei 14.063/2020, art. 4º, II; válida entre
particulares que aceitem o método — MP 2.200-2/2001, art. 10, §2º):

- identidade evidenciada por **prova de posse** (OTP de 6 dígitos entregue no
  e-mail/WhatsApp cadastrado do signatário) + nome completo + CPF declarados;
- **trilha de auditoria** gravada (IP, user-agent, timestamps de visualização,
  de verificação do OTP e da assinatura, hash SHA-256 do documento no envio e
  na assinatura);
- **integridade** garantida por hash: qualquer alteração do PDF invalida a
  verificação pública;
- **reforço opcional**: o certificado ICP-Brasil A1 da clínica (já configurado
  em `NfseConfig` para NFS-e) contra-assina o hash do PDF final no servidor
  (RSA-SHA256), elevando o não-repúdio. Não é PAdES embutido — é uma assinatura
  destacada do hash, registrada na evidência e verificável em `/verificar/[code]`.

### Evidência de mercado

Concorrentes com assinatura eletrônica de documentos: **PsicoManager**,
**Clínica Ágil**, **Clinicorp**, **Ninsaúde (Sign)**, **Clínica nas Nuvens**,
**PsiNota AI**, **TherapyNotes** e **SimplePractice** (e-signature de intake
docs é table stakes nos EUA). No nicho psi brasileiro, a combinação
Res. CFP 09/2024 + LGPD faz da assinatura de TCLE/contrato um critério de
escolha de sistema — vários concorrentes a vendem como add-on pago.

### Usuários-alvo

| Persona | Uso |
|---|---|
| ADMIN | Envia documentos de qualquer paciente para assinatura, acompanha pendências, cancela/reenvia, baixa o PDF assinado |
| PROFESSIONAL | Envia/acompanha documentos dos próprios pacientes; é avisado quando o documento volta assinado |
| Paciente adulto | Recebe link, lê o documento no celular, assina com OTP |
| Responsável (pais/tutores) | Assina pelos menores (role RESPONSAVEL, CPF validado contra o cadastro quando houver) |
| Terceiros (convênios, justiça) | Verificam autenticidade/integridade em `/verificar/[code]` sem login |

### Métricas de sucesso

- ≥ 70% dos envios assinados em até 7 dias (funil: PENDENTE → VISUALIZADO → ASSINADO).
- 100% das CONSULTAS `ONLINE` agendadas com aviso quando não há contrato assinado
  (guarda Res. CFP 09/2024), e queda contínua desse aviso ao longo do tempo.
- Substituição dos booleans manuais: % de consentimentos de pacientes novos
  atualizados automaticamente via TCLE assinado.
- Zero documentos assinados com hash divergente na verificação pública.

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **ADMIN/PROFESSIONAL**, a partir de um documento gerado na ficha do
   paciente, quero clicar em **"Enviar para assinatura"**, escolher o(s)
   signatário(s) (pré-preenchidos com os contatos do paciente/responsável) e
   disparar o link por e-mail ou WhatsApp.
2. Como **signatário**, quero abrir o link no celular, ler o PDF inteiro,
   marcar "Li e concordo", informar nome completo + CPF, receber um código de
   6 dígitos no meu e-mail/WhatsApp e concluir a assinatura.
3. Como **signatário**, quero poder **recusar** a assinatura informando um
   motivo opcional.
4. Como **PROFESSIONAL**, quero ser avisado (Todo + notificação) quando o
   documento for assinado ou recusado.
5. Como **ADMIN**, quero ver na aba Documentos do paciente o status de cada
   envio (Pendente / Visualizado / Assinado / Recusado / Expirado) e reenviar
   com um clique quando expirar.
6. Como **staff**, ao agendar uma CONSULTA **ONLINE** para paciente sem contrato
   terapêutico assinado, quero ver um aviso com atalho para enviar o contrato
   (Res. CFP 09/2024) — sem bloquear o agendamento.
7. Como **terceiro** (convênio, juiz, auditor), quero validar um PDF assinado
   informando o código de verificação impresso no documento, sem login.
8. Como **clínica**, quero que o TCLE assinado atualize automaticamente os
   consentimentos LGPD do cadastro do paciente (booleans + timestamps), mantendo
   os campos existentes coerentes.

### 2.2 Fluxos

#### Fluxo A — Staff envia para assinatura

1. Na aba **Documentos** do paciente (criada pelo plano 009), cada documento
   gerado ganha o botão **"Enviar para assinatura"**.
2. Abre o diálogo `SendForSignatureDialog`:
   - Lista de signatários (1..N, ordem sequencial). Sugestões pré-preenchidas:
     - **Paciente** (role `PACIENTE`): `Patient.name`, `cpf`, `email`, `phone`.
     - **Responsável** (role `RESPONSAVEL`): `billingResponsibleName`/`billingCpf`
       ou, vindos do intake, `guardianName`/`guardianCpfCnpj`, `motherName` +
       `motherPhone`, `fatherName` + `fatherPhone`.
   - Para cada signatário: nome, CPF (opcional no envio; obrigatório na
     assinatura), e-mail e/ou telefone, canal preferido do link (e-mail default;
     WhatsApp exige `consentWhatsApp`), validade (default 30 dias).
   - **Menores** (`Patient.birthDate` < 18 anos): o primeiro signatário é
     travado em role `RESPONSAVEL` (não se aceita PACIENTE menor assinando).
3. Submit → `POST /api/assinaturas`:
   - calcula SHA-256 do PDF do documento (hash de envio);
   - cria 1 `SignatureEnvelope` + N `SignatureRequest` (ordem sequencial);
   - gera token aleatório por signatário (guardado só o hash);
   - envia o link **apenas ao 1º signatário** via notification service;
   - audit log `SIGNATURE_REQUEST_SENT`.
4. Toast: *"Documento enviado para assinatura de {nome}."*

#### Fluxo B — Signatário assina (página pública mobile-first `/assinar/[token]`)

1. Abre o link → `GET /api/public/assinaturas/[token]`:
   - token inválido → tela "Link inválido".
   - expirado → tela educada com botão "Solicitar novo link" (cria Todo para o
     staff; não gera token sozinho).
   - hash do documento divergente do hash de envio (documento foi regenerado
     depois do envio) → envelope vira `INVALIDADO`, tela "Este documento foi
     atualizado pela clínica. Você receberá um novo link." + Todo para o staff.
   - válido → marca `VISUALIZADO` (1ª vez) + evento de visualização na evidência
     (IP, user-agent, timestamp).
2. Página renderiza o PDF inline (`GET /api/public/assinaturas/[token]/pdf`,
   `Content-Disposition: inline`) com scroll obrigatório.
3. Passo de identificação: checkbox **"Li e concordo com o conteúdo deste
   documento"** + campos *Nome completo* e *CPF* (máscara, validação de dígitos).
   - Se a request tem CPF cadastrado (ex.: CPF do responsável vindo do intake),
     o CPF digitado **deve coincidir** (comparação normalizada). Divergência →
     erro *"CPF não confere com o cadastro. Confira com a clínica."*
4. **"Receber código"** → `POST .../otp`: gera OTP 6 dígitos (TTL 10 min,
   máx. 5 verificações, reenvio limitado), envia pelo canal do signatário
   (e-mail via Resend; WhatsApp via provider atual — mock em dev).
5. Signatário digita o código → `POST .../assinar`:
   - verifica OTP (timing-safe, consumo único);
   - grava `ASSINADO` + `signedAt` + evidência (IP, UA, timestamps OTP, hash);
   - se há próximo signatário → envia o link dele (assinatura sequencial);
   - se era o **último**: monta o PDF final = PDF original + **página de
     assinaturas** (dados de cada signatário, data/hora DD/MM/YYYY HH:mm no fuso
     da clínica, resumo da evidência, SHA-256 do documento original, código de
     verificação); calcula o SHA-256 do arquivo final; contra-assina com o A1 da
     clínica se `NfseConfig` ativo; persiste tudo; atualiza consentimentos do
     `Patient` conforme o tipo do documento; cria Todo + notificação para o
     solicitante; audit `SIGNATURE_COMPLETED`.
6. Tela de sucesso: *"Documento assinado com sucesso!"* + código de verificação
   + botão "Baixar via assinada".

#### Fluxo C — Recusa

1. Na página de assinatura, link discreto **"Não concordo / recusar"**.
2. `POST .../recusar` com motivo opcional → request e envelope viram `RECUSADO`,
   evidência registra o evento, Todo para o solicitante
   (*"Assinatura recusada: {signatário} — {documento}"*), audit `SIGNATURE_DECLINED`.

#### Fluxo D — Lembretes e expiração (cron diário)

1. `/api/jobs/signature-reminders` (Vercel Cron, diário 11:00 UTC):
   - lembra o **signatário ativo** de envelopes `EM_ANDAMENTO` em **D+3** e
     **D+7** após o envio do link dele (máx. 2 lembretes, mesmo canal do envio,
     respeitando consentimento);
   - expira requests com `expiresAt < now` → request `EXPIRADO`; envelope
     `EXPIRADO` + Todo para o solicitante;
   - audit `SIGNATURE_REMINDER_JOB_EXECUTED` por clínica processada.

#### Fluxo E — Reenvio / cancelamento (staff)

- **Reenviar** (request `PENDENTE`/`VISUALIZADO`/`EXPIRADO`): gera token novo
  (invalida o anterior), reinicia `expiresAt` (+30 dias), reenvia o link.
  Envelope `EXPIRADO` volta a `EM_ANDAMENTO`. Audit `SIGNATURE_REQUEST_RESENT`.
- **Cancelar envelope**: qualquer estado não-final → `CANCELADO`; links param de
  funcionar. Audit `SIGNATURE_REQUEST_CANCELLED`.
- **Nova versão do contrato**: o plano 009 regenera o documento → o envelope
  antigo invalida por hash (Fluxo B.1); PDFs já assinados são **imutáveis**
  (nunca sobrescritos) — staff envia um novo envelope da nova versão.

#### Fluxo F — Verificação pública `/verificar/[code]`

1. Terceiro digita/abre o código de verificação impresso na página de assinaturas.
2. `GET /api/public/verificacao/[code]` → `{ valido, clinica, tituloDocumento,
   assinadoEm, signatarios: [nomes mascarados + CPF mascarado], sha256Final,
   contraAssinaturaICP: boolean }`.
3. A página oferece **conferência local de integridade**: o usuário seleciona o
   PDF que possui e o navegador calcula o SHA-256 via Web Crypto (o arquivo
   **não** é enviado ao servidor — LGPD) e compara com `sha256Final`.
   Resultado: *"Íntegro ✔"* ou *"O arquivo não corresponde ao documento
   assinado ✘"*.

#### Fluxo G — Guarda de telepsicologia (Res. CFP 09/2024)

1. No `CreateAppointmentSheet`/`AppointmentEditor`, ao selecionar tipo CONSULTA +
   modalidade **ONLINE** + paciente: fetch `GET /api/assinaturas/contrato-status?patientId=`.
2. Sem contrato assinado → `InlineAlert` (warning, não bloqueante):
   *"Este paciente não possui contrato terapêutico assinado (Res. CFP 09/2024)."*
   - Se existe documento de contrato gerado e não enviado → botão
     **"Enviar para assinatura"** (one-click, signatários default).
   - Se não existe documento → link "Gerar contrato" para a aba Documentos.

### 2.3 Telas

| Tela | Rota | Layout |
|---|---|---|
| Aba Documentos do paciente (alterada) | `/patients` → detalhe → aba "Documentos" | Tabela do plano 009 ganha coluna **Assinatura** (`SignatureStatusBadge`) + menu de ações: Enviar para assinatura / Reenviar / Cancelar envio / Baixar via assinada / Ver evidências |
| Diálogo de envio | modal | Lista de signatários (cards re-ordenáveis 1..N), campos nome/CPF/e-mail/telefone/canal, validade em dias, CTA "Enviar" |
| Detalhe do envio (evidências) | modal/section | Timeline: enviado → visualizado → OTP verificado → assinado, com data/hora DD/MM/YYYY HH:mm, IP e canal; hashes; código de verificação |
| Página do signatário | `/assinar/[token]` (pública, mobile-first) | Header com nome da clínica; PDF inline ocupando a tela; rodapé fixo com checkbox "Li e concordo" → form nome/CPF → passo OTP (6 caixas, reenviar em 60s) → sucesso |
| Recusa | passo da página acima | Textarea motivo opcional + confirmar |
| Link expirado | `/assinar/[token]` (estado) | Mensagem educada + "Solicitar novo link" |
| Verificação pública | `/verificar/[code]` (e `/verificar` com campo de código) | Card de resultado + conferência local do arquivo (input file, hash no navegador) |
| Pendências | dashboard/patients | Badge de contagem "Assinaturas pendentes" (padrão do alerta de fichas de intake) — v1 simples: contador na aba Documentos |

### 2.4 Regras de negócio

1. **Tenant isolation**: toda query inclui `clinicId`; rotas públicas resolvem a
   clínica **a partir do token/código**, nunca de parâmetro do cliente.
2. **Assinatura sequencial**: somente o signatário com menor `signingOrder` ainda
   não-assinado tem link ativo; os seguintes recebem o link automaticamente
   quando chega a vez deles.
3. **Imutabilidade**: o hash de envio congela o conteúdo. PDF final assinado
   nunca é alterado; nova versão ⇒ novo envelope.
4. **Hash de envio vs hash final**: a página de assinaturas imprime o SHA-256 do
   **documento original** e o **código de verificação** (o hash do arquivo final
   não pode ser impresso dentro dele mesmo — auto-referência); o SHA-256 do
   arquivo final fica no banco e é exposto em `/verificar/[code]`.
5. **OTP**: 6 dígitos (`crypto.randomInt`), TTL 10 min, máx. 5 verificações por
   código, máx. 3 envios por request a cada 15 min, rate limit por IP
   (`checkRateLimit`, `RATE_LIMIT_CONFIGS.sensitive`). Hash do código no banco
   (HMAC-SHA256 com `AUTH_SECRET`), nunca o código em claro.
6. **Token do link**: 32 bytes aleatórios base64url; banco guarda só o SHA-256.
   Validade default 30 dias (`expiresAt`). Reenvio gera token novo.
7. **Menores**: signatário 1 obrigatoriamente `RESPONSAVEL`; quando o cadastro
   tem CPF do responsável (intake/billing), o CPF digitado deve coincidir.
8. **Canais**: e-mail é o canal default (provider real Resend). WhatsApp usa o
   provider atual (`whatsapp-mock` — não entrega em produção; ver Riscos).
   Clínica sem consentimento WhatsApp do contato → e-mail obrigatório.
9. **Consentimentos LGPD**: ao concluir envelope de documento cujo tipo mapeia
   para consentimentos (ver `consent-sync.ts`), atualizar booleans + `*At` no
   `Patient` com `signedAt`, e audit log com old/new values.
10. **Notificações de assinatura sempre habilitadas**: os novos
    `NotificationType` entram em `ALWAYS_ENABLED_EMAIL_TYPES` (são disparados por
    ação explícita do staff/signatário, não dependem do flag
    `appointmentNotificationsEnabled`).
11. **Permissões**: nova feature RBAC `assinaturas` — ADMIN `WRITE`,
    PROFESSIONAL `WRITE` (envia para os próprios pacientes; rotas staff validam
    que o paciente pertence à clínica e, para PROFESSIONAL sem `agenda_others`,
    que o paciente é dele — `referenceProfessionalId` ou paciente com sessão
    sua, mesmo padrão das faturas).
12. **Verificação pública minimizada**: nomes mascarados
    (`"Maria S."`), CPF mascarado (`"***.456.789-**"`), sem dados clínicos.

### 2.5 Edge cases

| Caso | Comportamento |
|---|---|
| Link aberto após expirar | Tela educada + botão "Solicitar novo link" → cria Todo p/ staff (máx. 1 Todo pendente por request); audit `SIGNATURE_RENEWAL_REQUESTED` |
| Documento regenerado após envio | Hash divergente detectado no GET/assinar → envelope `INVALIDADO`, Todo p/ staff, tela explicativa; staff reenvia da nova versão |
| OTP esgotado (5 erros) | Código consumido; UI orienta pedir novo código; envios de OTP rate-limited |
| Dois signatários, 2º recusa | Envelope `RECUSADO`; assinatura do 1º permanece registrada na evidência, mas **não** há PDF final nem consent-sync |
| Solicitante sem `professionalProfileId` (ADMIN puro) | Todo é criado para o `referenceProfessionalId` do paciente; sem ambos, pula o Todo (fica a notificação + status na UI) |
| Paciente sem e-mail e sem consentimento WhatsApp | Diálogo de envio bloqueia o canal indisponível e exige preencher um contato; sem nenhum contato → erro *"Cadastre um e-mail ou telefone com consentimento para enviar."* |
| Token reenviado | Token antigo invalidado imediatamente (hash trocado); link velho cai em "Link inválido" |
| Clínica sem `NfseConfig` ativo | PDF final sem contra-assinatura ICP; evidência registra `countersigned: false` |
| Assinatura concorrente (duplo submit) | Transação Prisma + recheck de status dentro da transação → 2ª chamada recebe 409 "Documento já assinado" |
| Clínica em read-only (assinatura SaaS inativa) | `withFeatureAuth` já bloqueia mutações staff; páginas públicas de assinatura **continuam funcionando** (signatário não é culpado), mas reenvio/lembretes não saem para clínica `isActive=false` |
| Envelope cancelado com link aberto no celular do signatário | POSTs respondem 410 "Este envio foi cancelado pela clínica." |

### 2.6 Copy pt-BR (chaves principais)

```
Botão (staff):        "Enviar para assinatura"
Diálogo título:       "Enviar documento para assinatura"
Signatário roles:     "Paciente" / "Responsável"
Validade:             "Validade do link (dias)"
Enviado:              "Documento enviado para assinatura de {nome}."
Status badges:        "Aguardando assinatura" / "Visualizado" / "Assinado" /
                      "Recusado" / "Expirado" / "Cancelado" / "Invalidado"
Página assinatura:    "Assinatura de documento — {clínica}"
Checkbox:             "Li e concordo com o conteúdo deste documento"
Campos:               "Nome completo" / "CPF"
CTA OTP:              "Receber código" / "Reenviar código (60s)"
OTP enviado:          "Enviamos um código de 6 dígitos para {contato mascarado}."
CTA assinar:          "Assinar documento"
Sucesso:              "Documento assinado com sucesso!"
Código:               "Código de verificação: {code}"
Baixar:               "Baixar via assinada (PDF)"
Recusar:              "Não concordo com este documento" / "Motivo (opcional)" / "Confirmar recusa"
Recusado:             "Sua recusa foi registrada. A clínica foi avisada."
Expirado:             "Este link expirou. Solicite um novo link à clínica." / "Solicitar novo link"
Solicitado:           "Pedido enviado! A clínica entrará em contato."
Invalidado:           "Este documento foi atualizado pela clínica. Você receberá um novo link em breve."
CPF divergente:       "CPF não confere com o cadastro. Confira com a clínica."
OTP inválido:         "Código inválido ou expirado. Tente novamente."
Verificação título:   "Verificar autenticidade de documento"
Verificação ok:       "Documento autêntico — assinado em {DD/MM/YYYY HH:mm}"
Verificação falha:    "Código não encontrado ou documento inválido."
Conferir arquivo:     "Conferir meu arquivo PDF" → "Íntegro: o arquivo corresponde ao documento assinado." /
                      "O arquivo NÃO corresponde ao documento assinado."
Guarda telepsicologia:"Este paciente não possui contrato terapêutico assinado (Res. CFP 09/2024)."
Todo assinado:        "Documento assinado: {documento} — {paciente}"
Todo recusado:        "Assinatura recusada: {signatário} — {documento}"
Todo expirado:        "Assinatura expirou sem resposta: {documento} — {paciente}"
E-mail assunto:       "Documento para assinatura — {clínica}"
E-mail/WhatsApp corpo:"Olá {signerName}! A {clinicName} enviou o documento
                       \"{documentTitle}\" para sua assinatura eletrônica.
                       Acesse: {signingLink} (válido até {expiresAt})."
Lembrete:             "Lembrete: o documento \"{documentTitle}\" da {clinicName}
                       aguarda sua assinatura. Acesse: {signingLink}"
OTP mensagem:         "{code} é seu código para assinar \"{documentTitle}\" — {clinicName}.
                       Válido por 10 minutos."
```

---

## 3. Design Técnico

### 3.0 Contrato com o plano 009 (gerador-documentos-cfp) — pré-requisito

Este plano assina registros de **`GeneratedDocument`** (modelo do plano
`2026-06-11-009-feat-gerador-documentos-cfp`). Campos consumidos aqui, conforme
o model definido no plano 009 (§"Novo model GeneratedDocument"):

```
GeneratedDocument {
  id           String       (cuid)
  clinicId     String       (tenant)
  patientId    String
  templateType DocumentType (enum do 009)
  title        String       (ex.: "Contrato terapêutico — 11/06/2026")
  pdfData      Bytes        (PDF renderizado e imutável)
}
```

- **`GeneratedDocument` não tem campo de status**: o status de assinatura vive
  somente em `SignatureEnvelope` (fonte da verdade) e a UI deriva dele.
- **Extensão obrigatória do enum `DocumentType`**: o 009 define 8 tipos CFP
  (`DECLARACAO_COMPARECIMENTO`, `ATESTADO_PSICOLOGICO`, `RELATORIO_PSICOLOGICO`,
  `LAUDO_PSICOLOGICO`, `PARECER_PSICOLOGICO`, `ENCAMINHAMENTO`,
  `CONTRATO_TERAPEUTICO`, `RECIBO_REEMBOLSO`) — **não inclui** os documentos de
  consentimento deste plano. A migração daqui adiciona 5 valores:
  `TCLE`, `CONSENTIMENTO_MENOR`, `CONSENTIMENTO_IMAGEM`,
  `CONSENTIMENTO_GRAVACAO`, `TERMO_LGPD` (§3.1) e cria os seeds correspondentes
  em `src/lib/documents/seed-templates.ts` (o `SYSTEM_TEMPLATES:
  Record<DocumentType, ...>` do 009 é exaustivo — o TypeScript força os novos
  seeds; atualizar também `seed-templates.test.ts`, que conta os tipos).
- **Sem o 009 implementado, este plano não anda**: implementar o 009 primeiro.
  Se a implementação real do 009 divergir do plano dele, adaptar os nomes aqui
  na Etapa 1 — a lógica não muda.
- Armazenamento do PDF assinado: enquanto não existir o módulo
  `anexos-paciente`, seguimos o padrão existente do projeto de binários no
  Postgres (`Clinic.logoData`, `Invoice.notaFiscalPdf`) — coluna `Bytes` no
  envelope (§3.1). Quando `anexos-paciente` existir, migrar o storage é um
  refactor isolado.

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

**Novos enums:**

```prisma
enum SignerRole {
  PACIENTE
  RESPONSAVEL
}

enum SignatureRequestStatus {
  PENDENTE     // link criado; aguardando vez/abertura
  VISUALIZADO  // signatário abriu o documento
  ASSINADO
  RECUSADO
  EXPIRADO
  CANCELADO    // staff cancelou o envelope
  INVALIDADO   // hash do documento divergiu (regenerado após envio)
}

enum SignatureEnvelopeStatus {
  EM_ANDAMENTO
  CONCLUIDO
  RECUSADO
  EXPIRADO
  CANCELADO
  INVALIDADO
}
```

**Extensão de enum existente** (`NotificationType`) — 4 novos valores:
`DOCUMENT_SIGNATURE_REQUEST`, `DOCUMENT_SIGNATURE_OTP`,
`DOCUMENT_SIGNATURE_REMINDER`, `DOCUMENT_SIGNED`.

**Novos models:**

```prisma
/// Um envio de documento para assinatura (1 documento, N signatários sequenciais)
model SignatureEnvelope {
  id                 String                  @id @default(cuid())
  clinicId           String
  documentId         String                  // FK -> GeneratedDocument (plano 009)
  patientId          String
  requestedByUserId  String?
  status             SignatureEnvelopeStatus @default(EM_ANDAMENTO)
  originalSha256     String                  // hash do PDF no momento do envio
  signedPdf          Bytes?                  // PDF final carimbado (imutável após CONCLUIDO)
  signedSha256       String?                 // hash do arquivo final
  verificationCode   String?                 @unique // impresso na página de assinaturas
  countersignedAt    DateTime?               // contra-assinatura ICP A1 (opcional)
  countersignature   String?                 @db.Text // base64 RSA-SHA256(signedSha256) + cert
  completedAt        DateTime?
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt

  clinic      Clinic            @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  document    GeneratedDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  patient     Patient           @relation(fields: [patientId], references: [id], onDelete: Cascade)
  requestedBy User?             @relation(fields: [requestedByUserId], references: [id], onDelete: SetNull)
  requests    SignatureRequest[]

  @@index([clinicId, status])
  @@index([clinicId, patientId])
  @@index([documentId])
}

/// Um signatário dentro de um envelope
model SignatureRequest {
  id             String                 @id @default(cuid())
  clinicId       String                 // denormalizado p/ tenant isolation
  envelopeId     String
  signerName     String
  signerCpf      String?                // dígitos normalizados; obrigatório na assinatura
  signerEmail    String?
  signerPhone    String?
  role           SignerRole
  signingOrder   Int                    @default(1)
  status         SignatureRequestStatus @default(PENDENTE)
  tokenHash      String                 @unique // sha256 do token do link
  linkSentAt     DateTime?              // quando o link foi enviado a ESTE signatário
  expiresAt      DateTime
  viewedAt       DateTime?
  signedAt       DateTime?
  declinedAt     DateTime?
  declineReason  String?
  otpChannel     NotificationChannel?
  evidence       Json                   @default("{}") // SignatureEvidence (ver §3.2)
  remindersSent  Int                    @default(0)
  lastReminderAt DateTime?
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  clinic   Clinic            @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  envelope SignatureEnvelope @relation(fields: [envelopeId], references: [id], onDelete: Cascade)
  otps     SignatureOtp[]

  @@index([clinicId, status])
  @@index([envelopeId, signingOrder])
  @@index([status, expiresAt])
}

/// OTP de assinatura (hash do código, nunca em claro)
model SignatureOtp {
  id         String              @id @default(cuid())
  clinicId   String
  requestId  String
  codeHash   String              // HMAC-SHA256(AUTH_SECRET, requestId:code)
  channel    NotificationChannel
  attempts   Int                 @default(0)
  expiresAt  DateTime            // createdAt + 10 min
  consumedAt DateTime?
  createdAt  DateTime            @default(now())

  clinic  Clinic           @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  request SignatureRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

  @@index([requestId, expiresAt])
  @@index([expiresAt])
}
```

**Relações a adicionar nos models existentes:**

- `Clinic`: `signatureEnvelopes SignatureEnvelope[]`,
  `signatureRequests SignatureRequest[]`, `signatureOtps SignatureOtp[]`
- `Patient`: `signatureEnvelopes SignatureEnvelope[]`
- `User`: `requestedSignatureEnvelopes SignatureEnvelope[]`
- `GeneratedDocument` (plano 009): `signatureEnvelopes SignatureEnvelope[]`

**Migração** (autorada offline — **nunca** `prisma db push`/`migrate dev`):
`prisma/migrations/20260611150000_assinatura_digital/migration.sql` com
`CREATE TYPE` ×3, `ALTER TYPE "NotificationType" ADD VALUE` ×4,
`ALTER TYPE "DocumentType" ADD VALUE` ×5 (`TCLE`, `CONSENTIMENTO_MENOR`,
`CONSENTIMENTO_IMAGEM`, `CONSENTIMENTO_GRAVACAO`, `TERMO_LGPD` — ver §3.0) e
`CREATE TABLE` ×3 + índices. Os `ALTER TYPE ... ADD VALUE` ficam no topo da
migração e **nenhum INSERT usa os novos valores na mesma migração** (limitação
de enum em transação no Postgres — padrão já seguido nas migrações do projeto).
Validar com `npx prisma validate` + `npx prisma generate`.

### 3.2 Módulo de domínio `src/lib/assinaturas/` (funções puras + barrel)

> Segue o padrão pt-BR de `src/lib/financeiro/`. Cada arquivo < 200 linhas,
> teste colocado.

| Arquivo | Assinaturas |
|---|---|
| `tokens.ts` | `generateSigningToken(): string` (32 bytes base64url); `hashSigningToken(token: string): string` (sha256 hex); `buildSigningUrl(baseUrl: string, token: string): string` (`/assinar/{token}`); `computeExpiry(now: Date, days?: number): Date`; `DEFAULT_EXPIRY_DAYS = 30` |
| `otp.ts` | `generateOtpCode(): string` (6 dígitos, `crypto.randomInt`); `hashOtpCode(secret: string, requestId: string, code: string): string` (HMAC-SHA256); `verifyOtpCode(args: { secret; requestId; code; codeHash }): boolean` (timing-safe `timingSafeEqual`); `isOtpUsable(otp: { expiresAt: Date; consumedAt: Date \| null; attempts: number }, now: Date): { usable: boolean; reason?: "expired" \| "consumed" \| "too_many_attempts" }`; `OTP_TTL_MINUTES = 10`; `OTP_MAX_ATTEMPTS = 5`; `maskContact(emailOrPhone: string): string` (`m***a@g***.com` / `(**) *****-1234`) |
| `hashing.ts` | `sha256Hex(data: Uint8Array): string`; `hashesMatch(a: string, b: string): boolean` (case-insensitive) |
| `verification-code.ts` | `generateVerificationCode(): string` (3 grupos de 4 chars, alfabeto sem ambíguos `0/O/1/I/L`, ex. `K7XF-2MQ9-PA4D`); `normalizeVerificationCode(input: string): string`; `isValidVerificationCodeFormat(input: string): boolean` |
| `cpf.ts` | re-exporta/embrulha `isValidCpfCnpj`/`normalizeCpfCnpj` de `@/lib/intake/types` como `isValidCpf(cpf: string): boolean` (somente 11 dígitos), `normalizeCpf`, `formatCpf` (`000.000.000-00`), `maskCpf` (`***.456.789-**`), `cpfsMatch(a: string \| null, b: string): boolean` |
| `lifecycle.ts` | `activeRequest(requests: { signingOrder; status }[]): T \| null` (menor ordem não-final); `canResend(request: { status }): boolean` (PENDENTE/VISUALIZADO/EXPIRADO); `canCancelEnvelope(status: SignatureEnvelopeStatus): boolean`; `isRequestExpired(request: { expiresAt; status }, now: Date): boolean`; `envelopeStatusFrom(requests: { status }[]): SignatureEnvelopeStatus`; `reminderDue(request: { linkSentAt; remindersSent; lastReminderAt; status }, now: Date): boolean` (D+3 e D+7, máx. 2, só PENDENTE/VISUALIZADO); `REMINDER_DAYS = [3, 7]` |
| `evidence.ts` | tipo `SignatureEvidence { sentAt?, sentChannel?, viewEvents: { at, ip?, userAgent? }[], otpEvents: { at, channel, outcome: "sent" \| "verified" \| "failed" }[], signedAt?, signerIp?, signerUserAgent?, originalSha256, countersigned: boolean }`; `emptyEvidence(originalSha256: string): SignatureEvidence`; `parseEvidence(json: unknown): SignatureEvidence` (tolerante); `appendViewEvent(ev, at, ip?, userAgent?)`; `appendOtpEvent(ev, at, channel, outcome)`; `finalizeEvidence(ev, args: { signedAt; ip?; userAgent?; countersigned })`; `buildEvidenceSummaryLines(ev: SignatureEvidence, signer: { name; cpf; role }, tz: string): string[]` (linhas pt-BR, datas DD/MM/YYYY HH:mm no fuso) |
| `consent-sync.ts` | `mapDocumentTypeToConsents(docType: string): ConsentField[]` com `ConsentField = "consentPhotoVideo" \| "consentSessionRecording" \| "consentWhatsApp" \| "consentEmail"`; literais = valores do enum `DocumentType` (§3.0): `TCLE → []` (consentimento clínico, não de canal), `CONSENTIMENTO_IMAGEM → ["consentPhotoVideo"]`, `CONSENTIMENTO_GRAVACAO → ["consentSessionRecording"]`, `TERMO_LGPD → []`, `CONSENTIMENTO_MENOR → []`, tipos desconhecidos → `[]`; `buildConsentUpdateData(fields: ConsentField[], signedAt: Date): Record<string, boolean \| Date>` (`{ consentPhotoVideo: true, consentPhotoVideoAt: signedAt }` — os campos `*At` existem no `Patient`: `consentWhatsAppAt`, `consentEmailAt`, `consentPhotoVideoAt`, `consentSessionRecordingAt`) |
| `telepsych.ts` | `needsTelepsychContractWarning(args: { type: string; modality: string \| null; hasSignedContract: boolean }): boolean` (true só p/ CONSULTA + ONLINE + sem contrato); `CONTRACT_DOC_TYPES = ["CONTRATO_TERAPEUTICO"]` |
| `countersign.ts` | `countersignHash(sha256Hex: string, privateKeyPem: string): string` (node:crypto `sign("RSA-SHA256")`, base64); `verifyCountersign(sha256Hex: string, signatureB64: string, certPem: string): boolean` — o chamador descriptografa `NfseConfig.privateKeyPem`/`certificatePem` (AES-256-GCM) com `decrypt` de `@/lib/bank-reconciliation/encryption`, mesmo padrão de `src/lib/nfse/emit-single.ts` |
| `signature-page.ts` | `buildSignaturePageData(args: { clinicName; documentTitle; verificationCode; originalSha256; signers: SignerSummary[]; tz: string; countersigned: boolean }): SignaturePageData` — monta o conteúdo textual (pt-BR, datas formatadas) consumido pelo adapter de PDF; puro e testável |
| `evidence-pdf.ts` (adapter, não puro) | `appendSignaturePage(originalPdf: Uint8Array, data: SignaturePageData): Promise<Uint8Array>` — usa **pdf-lib** (nova dependência) para carregar o PDF original e desenhar a(s) página(s) de assinaturas ao final |
| `serialize.ts` | `toEnvelopeListItem(envelope + requests)`, `toEnvelopeDetail(...)` (inclui timeline de evidência já resumida), `toPublicSigningView(request, envelope, clinic)` (**minimizado**: sem ids internos além do necessário), `toVerificationResult(envelope, requests)` (nomes/CPFs mascarados) |
| `index.ts` | barrel re-exportando tudo (exceto adapters pesados, exportados por caminho direto como em `financeiro/invoice-pdf`) |

**Nova dependência**: `pdf-lib` (^1.17) — única forma viável de **anexar** página
a um PDF existente (o `@react-pdf/renderer` só cria documentos novos). Pure JS,
sem binários nativos, funciona em Vercel serverless.

### 3.3 Rotas de API

#### Staff — `withFeatureAuth({ feature: "assinaturas", ... })`

Handlers finos (<50 linhas de lógica inline). **Tenant-scoping obrigatório**: o
`documentId`/`patientId`/`envelopeId` do body/params é sempre buscado com
`findFirst({ where: { id, clinicId: user.clinicId } })` antes de qualquer uso —
usar os helpers de `src/lib/clinic/ownership.ts` (criar o helper
`assertClinicOwnership(model, id, clinicId)` nesse caminho caso o arquivo ainda
não exista no branch).

| Rota | Método | minAccess | Request → Response |
|---|---|---|---|
| `/api/assinaturas` | POST | WRITE | `{ documentId, signers: [{ name, cpf?, email?, phone?, role, channel: "EMAIL" \| "WHATSAPP" }], expiryDays? }` (zod) → valida documento+paciente da clínica, menor ⇒ 1º signer RESPONSAVEL, ≥1 contato por signer; cria envelope+requests em transação; calcula `originalSha256`; envia link ao 1º → `{ envelope }` 201. Audit `SIGNATURE_REQUEST_SENT` |
| `/api/assinaturas` | GET | READ | `?patientId=&status=&page=` → `{ envelopes: EnvelopeListItem[] }` (where `clinicId` + filtros; PROFESSIONAL sem `agenda_others`: restringe a pacientes próprios) |
| `/api/assinaturas/[id]` | GET | READ | → `{ envelope: EnvelopeDetail }` (timeline de evidências) |
| `/api/assinaturas/[id]/resend` | POST | WRITE | `{ requestId }` → `canResend` ⇒ token novo + `expiresAt` novo + reenvio; 422 caso contrário. Audit `SIGNATURE_REQUEST_RESENT` |
| `/api/assinaturas/[id]/cancel` | POST | WRITE | → `canCancelEnvelope` ⇒ envelope + requests não-finais `CANCELADO`. Audit `SIGNATURE_REQUEST_CANCELLED` |
| `/api/assinaturas/[id]/arquivo` | GET | READ | → PDF final (`application/pdf`, `Content-Disposition: attachment`); 404 se não `CONCLUIDO`. Audit `SIGNATURE_FILE_DOWNLOADED` |
| `/api/assinaturas/contrato-status` | GET | READ | `?patientId=` → `{ hasSignedContract: boolean, pendingEnvelopeId?: string, contractDocumentId?: string }` (existe envelope `CONCLUIDO` de documento tipo contrato? where sempre com `clinicId`) |

#### Públicas — `src/app/api/public/assinaturas/` (sem auth, rate-limited, `Cache-Control: private, no-store`)

O token (path param) identifica request + envelope + clínica. Lookup sempre por
`tokenHash`, depois recheck `clinic.isActive`.

| Rota | Método | Rate limit | Comportamento |
|---|---|---|---|
| `/api/public/assinaturas/[token]` | GET | `publicApi`/IP | resolve por `hashSigningToken(token)`; valida vez do signatário (`activeRequest`), expiração (⇒ marca `EXPIRADO`), hash do documento atual vs `originalSha256` (⇒ `INVALIDADO` + Todo); 1ª vez ⇒ `VISUALIZADO` + `appendViewEvent`; → `{ view: PublicSigningView }` (clínica, título, signer mascarado, status, expiresAt, canais OTP disponíveis) |
| `/api/public/assinaturas/[token]/pdf` | GET | `publicApi`/IP | → PDF original inline (mesmas validações; sem marcar nada) |
| `/api/public/assinaturas/[token]/otp` | POST | `sensitive`/IP + 3/15min por request | `{ name, cpf, channel? }` (zod) → valida CPF (dígitos + `cpfsMatch` quando há CPF cadastrado); invalida OTPs anteriores; cria `SignatureOtp` + `createAndSendNotification` (`DOCUMENT_SIGNATURE_OTP`); `appendOtpEvent("sent")` → `{ ok: true, sentTo: maskContact(...) }` |
| `/api/public/assinaturas/[token]/assinar` | POST | `sensitive`/IP | `{ name, cpf, code }` → transação: lock da request (recheck status), `verifyOtpCode` + `isOtpUsable` (incrementa `attempts` em falha), consome OTP, `ASSINADO` + evidência final; **não-último** ⇒ dispara link do próximo; **último** ⇒ finalização (abaixo) → `{ signed: true, verificationCode?, downloadUrl? }`; 409 já assinado; 410 cancelado |
| `/api/public/assinaturas/[token]/recusar` | POST | `sensitive`/IP | `{ reason? }` → `RECUSADO` (request+envelope) + Todo + audit `SIGNATURE_DECLINED` → `{ ok: true }` |
| `/api/public/assinaturas/[token]/renovar` | POST | `sensitive`/IP | só p/ request `EXPIRADO`: cria Todo "Reenviar documento p/ assinatura" (1 pendente por request) → `{ ok: true }`. Audit `SIGNATURE_RENEWAL_REQUESTED` |
| `/api/public/verificacao/[code]` | GET | `publicApi`/IP | `normalizeVerificationCode` → envelope `CONCLUIDO` → `{ valido: true, clinica, tituloDocumento, assinadoEm, signatarios: [{ nome mascarado, cpf mascarado, role, assinadoEm }], sha256Final, contraAssinaturaICP }`; não encontrado → `{ valido: false }` (200, sem vazamento) |
| `/api/public/assinaturas/[token]/arquivo` | GET | `publicApi`/IP | via assinada p/ o signatário (envelope `CONCLUIDO`; token ainda íntegro mesmo após assinatura) |

**Finalização (último signatário, dentro da transação + passos pós-commit):**

1. `appendSignaturePage(originalPdf, buildSignaturePageData(...))` → bytes finais.
2. `signedSha256 = sha256Hex(finalPdf)`; `verificationCode = generateVerificationCode()`.
3. `NfseConfig` ativo ⇒ `countersignHash(signedSha256, keyPem)` (decrypt do PEM
   reusa o helper do módulo nfse); falha de countersign **não** aborta a
   assinatura (registra `countersigned: false`).
4. Persiste envelope: `CONCLUIDO`, `signedPdf`, `signedSha256`,
   `verificationCode`, `completedAt` (`GeneratedDocument` não tem status — a UI
   deriva tudo do envelope, §3.0).
5. `consent-sync`: atualiza `Patient` (booleans + `*At`) com audit
   `PATIENT_UPDATED` (oldValues/newValues).
6. Todo para o solicitante (`requestedBy.professionalProfileId` →
   fallback `patient.referenceProfessionalId` → sem ambos, pula) +
   `createAndSendNotification` (`DOCUMENT_SIGNED`, e-mail do solicitante quando
   houver).
7. Audit `SIGNATURE_COMPLETED` (`userId: null` — ator é o signatário; `newValues`
   carrega `envelopeId`, `signerName` mascarado, hashes).

#### Cron — `src/app/api/jobs/signature-reminders/route.ts`

- `GET` protegido por `Bearer ${CRON_SECRET}` (padrão de `send-reminders`).
- Lógica pura extraída para `src/lib/jobs/signature-reminders.ts`:
  `selectRequestsToRemind(requests, now)`, `selectRequestsToExpire(requests, now)`,
  `buildReminderVariables(...)`.
- Por clínica ativa: lembra (`reminderDue`) via canal original, expira vencidos,
  cria Todos de expiração, audit `SIGNATURE_REMINDER_JOB_EXECUTED`.
- `vercel.json` → adicionar `{ "path": "/api/jobs/signature-reminders", "schedule": "0 11 * * *" }`.

### 3.4 RBAC — nova feature `assinaturas`

- `src/lib/rbac/types.ts`: adicionar `"assinaturas"` a `FEATURES` e
  `FEATURE_LABELS["assinaturas"] = "Assinaturas"`.
- `src/lib/rbac/permissions.ts` → `ROLE_DEFAULTS`:
  `ADMIN.assinaturas = "WRITE"`, `PROFESSIONAL.assinaturas = "WRITE"`.
- Overrides por usuário já funcionam via `UserPermission` (feature é string).
- A UI de permissões de usuários lista features a partir de `FEATURES`/labels —
  nada além do registro acima.

### 3.5 Notificações

- `prisma/schema.prisma`: 4 novos `NotificationType` (§3.1).
- `src/lib/notifications/notification-service.ts`: adicionar os 4 tipos a
  `ALWAYS_ENABLED_EMAIL_TYPES` (disparo é por ação explícita; OTP **tem** que
  sair independentemente do flag `appointmentNotificationsEnabled`).
- `src/lib/notifications/templates.ts`: templates default (WHATSAPP + EMAIL)
  para os 4 tipos com variáveis `{{signerName}}`, `{{clinicName}}`,
  `{{documentTitle}}`, `{{signingLink}}`, `{{expiresAt}}`, `{{code}}`
  (copy em §2.6). Templates por clínica continuam customizáveis via
  `NotificationTemplate` (unique `clinicId+type+channel` já cobre).
- Canal WhatsApp permanece no provider `whatsapp-mock` — ver Riscos.

### 3.6 Auditoria

`src/lib/rbac/audit.ts` → novas actions:

```
SIGNATURE_REQUEST_SENT, SIGNATURE_REQUEST_RESENT, SIGNATURE_REQUEST_CANCELLED,
SIGNATURE_VIEWED, SIGNATURE_COMPLETED, SIGNATURE_DECLINED, SIGNATURE_EXPIRED,
SIGNATURE_INVALIDATED, SIGNATURE_RENEWAL_REQUESTED, SIGNATURE_FILE_DOWNLOADED,
SIGNATURE_REMINDER_JOB_EXECUTED
```

Eventos públicos (signatário) logam com `userId: null` e `entityType:
"SignatureEnvelope"` ou `"SignatureRequest"`; labels pt-BR em
`src/lib/audit/field-labels.ts` se a tela de auditoria exibir entityTypes.

### 3.7 UI — páginas e componentes

**Novos (públicos):**

```
src/app/assinar/[token]/
├── page.tsx                  # server shell; estado resolvido client-side via GET público
└── components/
    ├── SigningFlow.tsx       # máquina de passos: carregar → ler → identificar → otp → fim
    ├── DocumentViewer.tsx    # <embed>/<iframe> do PDF inline + fallback "Baixar para ler"
    ├── SignerIdentification.tsx  # checkbox + nome + CPF (react-hook-form + zod, máscara)
    ├── OtpStep.tsx           # 6 caixas, reenviar em 60s (timer via useMountEffect)
    ├── DeclineDialog.tsx
    ├── SignedSuccess.tsx     # código de verificação + download
    └── ExpiredView.tsx       # estado expirado/invalidado/cancelado
src/app/verificar/
├── page.tsx                  # campo de código (máscara K7XF-2MQ9-PA4D)
└── [code]/page.tsx           # resultado + <FileIntegrityCheck/> (Web Crypto, hash local)
```

**Novos (staff), em `src/app/patients/components/`:**

- `SendForSignatureDialog.tsx` — formulário de signatários (rhf + zod).
- `SignatureStatusBadge.tsx` — badge por status (cores: amber pendente, blue
  visualizado, green assinado, red recusado, gray expirado/cancelado/invalidado).
- `SignatureEvidenceTimeline.tsx` — timeline de evidências do detalhe.

**Edições em arquivos existentes:**

| Arquivo | Mudança |
|---|---|
| `src/app/patients/components/DocumentsTab.tsx` (criado pelo plano 009) | coluna Assinatura (`SignatureStatusBadge`) + ações Enviar/Reenviar/Cancelar/Baixar/Evidências |
| `src/app/patients/components/PatientDetailsView.tsx` | nada além do que o 009 já faz (estende `PatientTabKey` — hoje `"dados" \| "historico" \| "financeiro"` — com `"documentos"`); conferir que a aba existe antes da Etapa 9 |
| `src/lib/documents/seed-templates.ts` + `seed-templates.test.ts` (do plano 009) | seeds dos 5 novos `DocumentType` (§3.0) — corpo padrão de TCLE, consentimentos e termo LGPD |
| `src/app/agenda/components/CreateAppointmentSheet.tsx` e `AppointmentEditor.tsx` | guarda telepsicologia (Fluxo G): fetch de `contrato-status` no handler de seleção paciente/modalidade (sem `useEffect` — derivar/disparar no evento) + `InlineAlert` reutilizado |
| `src/shared/components/ui/app-shell.tsx` | adicionar `"/assinar"` e `"/verificar"` aos `PUBLIC_PATHS` (sem sidebar/poller de staff) |
| `vercel.json` | cron `signature-reminders` (§3.3) |

Convenções: pt-BR em toda copy; datas `toLocaleDateString("pt-BR")` +
`HH:mm`; sem `useEffect` cru (derivar estado, handlers, `key`-reset,
`useMountEffect` só para o timer do OTP); sonner para toasts; lucide-react
(`FileSignature`, `ShieldCheck`, `Send`, `Clock`, `XCircle`).

### 3.8 Segurança (resumo)

- Tokens/OTPs nunca armazenados em claro (sha256 / HMAC); comparação timing-safe.
- Rotas públicas: rate limit por IP (`checkRateLimit`) + janelas por request.
- Anti-enumeração: `/verificar/[code]` responde 200 `{ valido: false }`;
  `/assinar/[token]` não diferencia "não existe" de "inválido".
- Evidência contém dados pessoais → nunca exposta em rota pública
  (somente via staff `GET /api/assinaturas/[id]`, feature-gated).
- PDF final servido com `Content-Type: application/pdf` e sem cache público.

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`. Enums Prisma
como string literais. Tempo com `vi.useFakeTimers()`.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/assinaturas/tokens.test.ts` | token ≥ 32 bytes/url-safe; hash determinístico e ≠ token; `computeExpiry` default 30d e custom; `buildSigningUrl` |
| `src/lib/assinaturas/otp.test.ts` | código sempre 6 dígitos (inclui zeros à esquerda); hash determinístico por requestId; verify timing-safe true/false; `isOtpUsable` expirado/consumido/5 tentativas; `maskContact` e-mail e telefone |
| `src/lib/assinaturas/hashing.test.ts` | sha256 de vetor conhecido; `hashesMatch` case-insensitive |
| `src/lib/assinaturas/verification-code.test.ts` | formato `XXXX-XXXX-XXXX`; sem chars ambíguos; normalize (lowercase/sem hífen) round-trip; format inválido |
| `src/lib/assinaturas/cpf.test.ts` | CPF válido/ inválido/repetido; normalize com máscara; `maskCpf`; `cpfsMatch` (null cadastrado ⇒ true; divergente ⇒ false) |
| `src/lib/assinaturas/lifecycle.test.ts` | `activeRequest` ordem sequencial (pula assinados, para no pendente); `envelopeStatusFrom` (todos assinados ⇒ CONCLUIDO; um recusado ⇒ RECUSADO; expirado ⇒ EXPIRADO; prioridades); `canResend`/`canCancelEnvelope` por status; `isRequestExpired` fronteira exata; `reminderDue` D+2 não / D+3 sim / D+7 sim / máx. 2 / não lembra ASSINADO |
| `src/lib/assinaturas/evidence.test.ts` | `emptyEvidence`; appends imutáveis (não mutam input); `parseEvidence` tolera JSON `{}`/corrompido; `finalizeEvidence`; `buildEvidenceSummaryLines` datas DD/MM/YYYY HH:mm no fuso `America/Sao_Paulo` |
| `src/lib/assinaturas/consent-sync.test.ts` | mapeamento por tipo; `buildConsentUpdateData` gera pares boolean+timestamp; tipo desconhecido ⇒ `[]` |
| `src/lib/assinaturas/telepsych.test.ts` | warning só CONSULTA+ONLINE+sem contrato; PRESENCIAL/null modality/TAREFA ⇒ false |
| `src/lib/assinaturas/countersign.test.ts` | sign+verify round-trip com chave RSA de teste gerada no teste; verify falha com hash alterado |
| `src/lib/assinaturas/signature-page.test.ts` | conteúdo pt-BR; um bloco por signatário; código de verificação e sha256 original presentes; flag de contra-assinatura |
| `src/lib/assinaturas/evidence-pdf.test.ts` | dado um PDF mínimo gerado com pdf-lib no próprio teste: output tem +1 página; bytes mudam (hash difere); original não mutado |
| `src/lib/jobs/signature-reminders.test.ts` | `selectRequestsToRemind` janelas D+3/D+7 com fake timers; `selectRequestsToExpire` fronteira; nunca seleciona status finais; idempotência (já lembrado hoje não repete) |
| `src/lib/assinaturas/serialize.test.ts` | mascaramento de nome/CPF na verificação; `toPublicSigningView` não vaza ids/evidência |
| `src/lib/rbac/permissions.test.ts` (estender) | `resolvePermissions` inclui `assinaturas` com defaults ADMIN/PROFESSIONAL WRITE e override NONE |

Gates antes de cada commit: `npx prisma generate` + `npm run test` +
`npm run build` (todos verdes).

---

## 5. Etapas de Implementação

> Trabalhar em worktree isolada: `bash scripts/new-feature.sh assinatura-digital-tcle`.
> Pré-requisito: plano 009 (GeneratedDocument) implementado/mergeado.

1. **Schema + migração** — Adicionar enums, models e relações (§3.1) ao
   `prisma/schema.prisma` — incluindo os 5 novos valores de `DocumentType` e os
   4 de `NotificationType` — conferindo os nomes reais de `GeneratedDocument`
   como implementado pelo 009 (§3.0). Autorar
   `prisma/migrations/20260611150000_assinatura_digital/migration.sql`
   offline. Verificar: `npx prisma validate` + `npx prisma generate` passam;
   `npm run build` verde.
2. **Dependência pdf-lib + seeds dos novos tipos** — `npm install pdf-lib`;
   adicionar os seeds de `TCLE`, `CONSENTIMENTO_MENOR`, `CONSENTIMENTO_IMAGEM`,
   `CONSENTIMENTO_GRAVACAO` e `TERMO_LGPD` em
   `src/lib/documents/seed-templates.ts` (o `Record<DocumentType, ...>`
   exaustivo quebra o build até isso ser feito) e atualizar
   `seed-templates.test.ts`. Verificar: `npm run test` + build verdes.
3. **Módulo de domínio (puro)** — `src/lib/assinaturas/`: `tokens.ts`, `otp.ts`,
   `hashing.ts`, `verification-code.ts`, `cpf.ts`, `lifecycle.ts`,
   `evidence.ts`, `consent-sync.ts`, `telepsych.ts`, `signature-page.ts`,
   `serialize.ts`, `index.ts` + todos os testes do §4. Verificar:
   `npx vitest run src/lib/assinaturas/` verde.
4. **Adapters do módulo** — `countersign.ts` + `evidence-pdf.ts` + testes.
   Verificar: testes verdes.
5. **RBAC + auditoria + notificações (registro)** — feature `assinaturas`
   (§3.4), actions de audit (§3.6), tipos em `ALWAYS_ENABLED_EMAIL_TYPES` e
   templates default (§3.5). Estender `permissions.test.ts`. Verificar:
   `npm run test` verde.
6. **Rotas staff** — §3.3 (POST/GET/resend/cancel/arquivo/contrato-status), com
   ownership-check de `documentId`/`patientId` e audit. Verificar manualmente:
   criar envelope via curl autenticado num documento seed; checar linhas em
   `SignatureEnvelope`/`SignatureRequest` e `Notification` criadas.
7. **Rotas públicas do signatário** — GET view/pdf, POST otp/assinar/recusar/
   renovar (§3.3), incluindo finalização completa (página de assinaturas,
   verification code, countersign, consent-sync, Todo). Verificar: fluxo
   completo via curl em dev (OTP visível no log do provider mock/Resend dev);
   PDF final baixável com página extra; booleans do Patient atualizados.
8. **Verificação pública** — rota `verificacao/[code]` + páginas `/verificar`.
   Verificar: código válido retorna metadados mascarados; hash local confere.
9. **UI staff** — `SendForSignatureDialog`, `SignatureStatusBadge`,
   `SignatureEvidenceTimeline`, integração na aba Documentos. Verificar: fluxo
   A inteiro pelo navegador.
10. **UI pública do signatário** — `/assinar/[token]` (componentes §3.7) +
    `PUBLIC_PATHS`. Verificar: fluxo B/C inteiro num viewport mobile.
11. **Guarda telepsicologia** — `contrato-status` + `InlineAlert` no
    `CreateAppointmentSheet`/`AppointmentEditor`. Verificar: aviso aparece p/
    ONLINE sem contrato e some com envelope CONCLUIDO.
12. **Cron de lembretes/expiração** — `src/lib/jobs/signature-reminders.ts` +
    rota job + entrada no `vercel.json`. Verificar: chamada manual com
    `CRON_SECRET` lembra D+3 (fake data no banco local) e expira vencidos.
13. **Gates finais + commit** — `npx prisma generate`, `npm run test`,
    `npm run build` todos verdes. Commit convencional local (sem push):
    `feat(assinaturas): assinatura eletrônica de TCLE e contratos` +
    `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 6. Riscos e Questões em Aberto

### Riscos

1. **WhatsApp é mock**: hoje só o e-mail (Resend) entrega de verdade. Link e OTP
   por WhatsApp ficarão silenciosamente não-entregues em produção. Mitigação:
   UI default e-mail; canal WhatsApp marcado como "(em breve)" até existir
   provider real; o modelo já suporta a troca.
2. **Validade jurídica é probabilística, não absoluta**: assinatura avançada
   vale entre partes que aceitam o método (MP 2.200-2/2001 art. 10 §2º) e tem
   forte aceitação em juízo com boa trilha de evidência, mas não equivale à
   qualificada (ICP-Brasil do próprio signatário). Mitigação: contra-assinatura
   A1 da clínica + página de evidências + verificação pública. Recomendar na
   doc da clínica uma cláusula de aceite do meio eletrônico no próprio contrato.
3. **Contra-assinatura não é PAdES**: é assinatura destacada do hash (registrada
   no banco e verificável no `/verificar`), não embutida no PDF — Adobe Reader
   não a exibirá como assinatura digital. Documentar para o usuário.
4. **PDFs em `Bytes` no Postgres (Neon)**: 2 cópias por documento
   (original no 009 + final aqui), ~100–500 KB cada. Aceitável no volume de
   clínicas-alvo; migrar para `anexos-paciente`/object storage quando existir.
   Nunca incluir `signedPdf` em `select` de listagens.
5. **Rate limit em memória**: serverless multi-instância dilui o limite (risco
   já aceito no projeto para confirm/cancel/intake). OTP com máx. 5 verificações
   por código limita força bruta independentemente do rate limit.
6. **`ALTER TYPE ADD VALUE` em migração**: manter os ALTERs isolados no topo e
   sem uso dos novos valores na mesma migração (ver §3.1) para não quebrar o
   `prisma migrate deploy` do `vercel-build`.
7. **Acoplamento ao plano 009**: o contrato §3.0 foi alinhado ao plano escrito
   do 009 (`templateType`/`pdfData`/`title`, enum `DocumentType`, seeds em
   `src/lib/documents/seed-templates.ts`); se a **implementação** do 009
   divergir do plano dele, resolver na Etapa 1 antes de codar o resto. Os
   corpos-seed dos novos documentos (TCLE etc.) precisam de revisão
   clínico-jurídica, como já apontado no próprio 009.
8. **iframe/embed de PDF em mobile**: alguns Androids não renderizam PDF inline.
   Mitigação: `DocumentViewer` com fallback "Baixar para ler" + a confirmação de
   leitura é o checkbox, não o scroll.

### Questões em aberto

1. **Gating por plano SaaS**: assinatura entra em todos os planos ou como
   diferencial premium (`Plan.allowSignatures`), como concorrentes fazem?
   (Default deste plano: sem gating; adicionar depois é 1 boolean + 1 check.)
2. **Mapeamento consent-sync definitivo**: quais tipos de documento do 009
   mapeiam para quais booleans do `Patient` (e se TCLE deve marcar algo além do
   registro do envelope)? Validar com usuário-piloto antes da Etapa 3.
3. **Ambos os responsáveis obrigatórios para menores?** O modelo suporta N
   signatários sequenciais; a regra "exigir 2 responsáveis" fica a critério da
   clínica no diálogo de envio (default: 1). Confirmar com piloto.
4. **Re-assinatura periódica de contrato** (ex.: anual): fora do escopo v1;
   o cron poderia abrir Todos de renovação por idade do envelope.
5. **Posição do carimbo**: v1 usa página de assinaturas ao final (padrão
   Clicksign/D4Sign para evidência). Selo visual por página (rodapé com código)
   fica para v2 — pdf-lib permite, custo baixo.
6. **Portal do paciente (plano 003)**: quando existir, a aba Documentos do
   portal deve listar envelopes pendentes do paciente logado e abrir o mesmo
   fluxo `/assinar/[token]` — manter o fluxo público como fonte única.
