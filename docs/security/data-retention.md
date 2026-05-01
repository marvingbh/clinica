# Política de Retenção de Dados — Clinica

**Última atualização:** 2026-04-22

Este documento registra os prazos de retenção legais que se aplicam aos dados
processados pela plataforma e as exceções ao direito de eliminação da LGPD
(Art. 18, V), conforme disposto em Art. 16 da própria LGPD.

## Bases legais de retenção

### Prontuários clínicos (20 anos)

- **Fundamento:** Lei 13.787/2018 + CFP Resolução 001/2009 + CFP Resolução 006/2019.
- **Escopo:** `Appointment.notes`, `Patient.therapeuticProject`, qualquer registro
  clínico relacionado a atendimento psicológico/psiquiátrico digitalizado.
- **Prazo:** 20 anos a contar do último registro.
- **Efeito na eliminação LGPD:** estes campos **não** são eliminados por
  solicitação do titular. A purga (`/api/patients/[id]/purge`) sobrescreve os
  campos `notes` e `cancellationReason` em `Appointment`, mas o registro do
  atendimento (data, duração, tipo) permanece pelo prazo legal.

### Documentos fiscais (5 anos)

- **Fundamento:** CTN Arts. 173-174.
- **Escopo:** `Invoice`, `InvoiceItem`, NFS-e (XML e DANFSE em PDF),
  `SessionCredit` vinculadas a faturas emitidas.
- **Prazo:** 5 anos a contar do fato gerador (emissão do documento).
- **Efeito na eliminação LGPD:** registros fiscais permanecem pelo prazo legal.
  A purga anonimiza `Invoice.notes`, `InvoiceItem.description`, mas preserva
  `totalAmount`, `referenceMonth`, `referenceYear`, e a NFS-e já emitida.

### Logs de auditoria (perpétuos até redação)

- **Escopo:** `AuditLog`.
- **Política:** a plataforma mantém logs de auditoria indefinidamente como
  evidência de conformidade. Quando um titular solicita eliminação, os campos
  `oldValues` e `newValues` que contêm PII são redigidos (`[redacted]`), mas
  a linha `(clinicId, userId, action, entityType, entityId, createdAt)`
  permanece. Uma entrada `AUDIT_REDACTED` documenta a redação.

## Escopo do `POST /api/patients/[id]/purge`

**Anonimiza imediatamente na transação principal:**

- `Patient.name` → `"[Paciente removido]"`
- `Patient.cpf`, `email`, `motherName`, `fatherName`, `billingCpf`,
  `billingResponsibleName`, endereço completo, `notes`, `therapeuticProject`,
  `nfseObs`, `birthDate`, `schoolName`/`Unit`/`Shift`, `motherPhone`,
  `fatherPhone`, `firstAppointmentDate`, `lastFeeAdjustmentDate` → `NULL`
- `Patient.phone` → `""`
- Timestamps de consentimento → `NULL`
- `PatientPhone` → `DELETE`
- `PatientUsualPayer` → `DELETE`
- `IntakeSubmission` vinculadas → `DELETE`

**Redige em lotes após a transação principal (fora do limite de 30s):**

- `AuditLog.oldValues`/`newValues` onde `entityType='Patient'` → `NULL`
- `Notification.content` → `"[conteudo removido...]"`, `subject`/`recipient`/`failureReason` → `NULL`/`[redacted]`
- `Appointment.notes`/`cancellationReason` → `NULL`
- `SessionCredit.reason` → `"[redacted]"`
- `Invoice.notes` → `NULL`
- `InvoiceItem.description` → `"[redacted]"`
- `AdnLog.requestBody`/`responseBody` → `NULL` (payloads NFS-e contêm CPF
  completo e endereço — crítico sob LGPD)

**Não eliminado:**

- `Invoice.totalAmount`, `referenceMonth`/`Year`, `status` (retenção fiscal)
- `Appointment.scheduledAt`, `status`, `type`, duração (retenção clínica)
- `AuditLog` com a estrutura esvaziada mas preservando o evento

## Processadores externos (fora do controle da plataforma)

Estas retenções ocorrem em serviços de terceiros e **não são afetadas pelo
`/purge`**. O aviso de privacidade do paciente deve indicar esta limitação.

| Processador | Dados | Retenção típica |
|-------------|-------|-----------------|
| Resend (e-mail) | Corpo completo dos e-mails transacionais | ~30 dias |
| Twilio/WhatsApp Business | Conteúdo das mensagens enviadas | ~13 meses |
| Stripe | Identificadores do cliente (customer ID, metadata) | retenção própria Stripe |
| Banco Inter (conciliação bancária) | Descrições de transação | retenção própria do banco |
| ANPD/ADN (NFS-e municipal) | XMLs enviados e protocolos | prazo da prefeitura emissora |

## Procedimento de restore de backup

Se um backup anterior à purga for restaurado, os dados re-aparecem. O runbook
de restore **deve** reexecutar o log de purgas:

```bash
npm run restore:apply-purge-log
```

Este script itera sobre todas as entradas `PATIENT_PURGED` do `AuditLog` em
ordem cronológica e reaplica a purga a cada paciente contra o banco restaurado.
Nenhum restore em produção pode ir ao ar sem essa etapa.

> **TODO:** o script `restore:apply-purge-log` ainda não existe. Criar antes
> do primeiro restore em produção pós-purga.

## Registro de processamento (LGPD Art. 37)

- **Eventos de mutação** (`PATIENT_*`, `USER_*`, `INVOICE_*`, etc.) são
  gravados em `AuditLog` em tempo real.
- **Eventos de exportação** em lote (`BATCH_EXPORTED`) são gravados quando
  um administrador baixa PDFs/ZIP ou NFS-e.
- **Eventos de eliminação** (`PATIENT_PURGE_REQUESTED`, `PATIENT_PURGED`,
  `AUDIT_REDACTED`) são o registro primário para auditoria ANPD.

## Solicitação do titular (checklist para o administrador da clínica)

1. Abrir o prontuário do paciente em `/pacientes/[id]`.
2. Clicar **"Eliminar dados (LGPD)"** (apenas ADMIN).
3. Digitar o nome completo do paciente para confirmação.
4. Informar a razão — idealmente o ID da solicitação do titular no registro
   interno de dados (Art. 37).
5. Confirmar. A tela mostra o ID do registro de auditoria — guardar para
   resposta formal ao titular.
6. Comunicar ao titular:
   - Dados de identificação foram eliminados;
   - Documentos fiscais e clínicos permanecem pelos prazos legais
     acima, anonimizados;
   - Processadores externos (Resend, Twilio) retêm por prazos próprios
     fora do nosso controle.

## Quando a purga **não** é suficiente

- **Ordem judicial de eliminação total:** exige intervenção manual sobre
  backups e réplicas. Escalar para a equipe de engenharia.
- **Paciente com obrigação fiscal em aberto:** purga anonimiza PII mas
  mantém o saldo; cobrança continua via CPF original se em inscrição de
  dívida ativa — orientação legal caso a caso.
