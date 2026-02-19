# Change History for Agenda & Patients

## Overview

Add inline change history to patient detail sheets and appointment edit sheets, visible to admins only. Shows who changed what and when, with human-readable field diffs in Portuguese.

## Approach

Leverage the existing `AuditLog` model which already stores `oldValues`/`newValues` as JSON, `userId`, `createdAt`, `entityType`, and `entityId`. No schema migration needed.

Work consists of:
1. Fill audit logging gaps in API routes
2. Build a shared field-label mapping + value formatters
3. Add a new API endpoint for entity-scoped audit queries
4. Build a reusable `HistoryTimeline` component
5. Add "Historico" tabs to patient detail and appointment editor (admin only)

## API & Data Layer

### New Endpoint: `GET /api/audit-logs`

- **Auth:** Admin only via `withFeatureAuth({ feature: "audit_logs", minAccess: "READ" })`
- **Query params:** `entityType` (required), `entityId` (required), `page` (default 1), `limit` (default 20)
- **Response:** `{ entries: AuditEntry[], pagination: { page, limit, total } }`
- Each entry includes: `id`, `action`, `userName` (resolved from userId), `createdAt`, `changes` (array of `{ field, label, oldValue, newValue }`)

### Fill Audit Gaps

Ensure consistent `oldValues`/`newValues` logging in these routes:

| Route | Gap |
|---|---|
| `appointments/[id]` PATCH | Missing `APPOINTMENT_UPDATED` with old/new values |
| `appointments/[id]/status` PATCH | Needs `oldValues` with previous status |
| `appointments/[id]/cancel` POST | Needs `oldValues` with pre-cancel state |
| `appointments/recurrences/[id]` PATCH | Needs old/new values for recurrence edits |

### Field Label Mapping

A shared constant mapping DB field names to Portuguese labels and providing value formatters:

```
name -> "Nome"
phone -> "Telefone"
email -> "Email"
birthDate -> "Data de Nascimento" (format as DD/MM/YYYY)
status -> "Status" (map enum values to Portuguese labels)
scheduledAt -> "Data/Hora" (format as DD/MM/YYYY HH:mm)
modality -> "Modalidade" (ONLINE -> "Online", PRESENCIAL -> "Presencial")
notes -> "Observacoes"
price -> "Valor" (format as R$ X,XX)
cancellationReason -> "Motivo do Cancelamento"
sessionFee -> "Valor da Sessao" (format as R$ X,XX)
referenceProfessionalId -> "Profissional Referencia" (resolve name)
consentWhatsApp -> "Consentimento WhatsApp" (true/false -> "Sim"/"Nao")
consentEmail -> "Consentimento Email" (true/false -> "Sim"/"Nao")
isActive -> "Ativo" (true/false -> "Sim"/"Nao")
type -> "Tipo" (map enum to Portuguese)
title -> "Titulo"
```

## UI Design

### Reusable Component: `HistoryTimeline`

`<HistoryTimeline entityType="Patient" entityId={id} />`

- Fetches from `GET /api/audit-logs?entityType=X&entityId=Y`
- Renders a vertical timeline, newest first
- Each entry shows:
  - Timestamp (DD/MM/YYYY HH:mm) + user name
  - Action description ("criou", "editou", "cancelou", etc.)
  - For edits: list of changed fields with old -> new values
  - For creates: list of initial values
- "Carregar mais" button for pagination

### Patient Detail: "Historico" Tab

- Add tabs to the patient detail sheet: "Dados" (current content) and "Historico"
- Admin sees both tabs; professionals only see "Dados"
- "Historico" tab renders `<HistoryTimeline entityType="Patient" entityId={patientId} />`

### Appointment Editor: "Historico" Tab

- Add tabs to the appointment edit sheet: "Detalhes" (current content) and "Historico"
- Admin sees both tabs; professionals only see "Detalhes"
- "Historico" tab renders `<HistoryTimeline entityType="Appointment" entityId={appointmentId} />`

## Access Control

- History is **admin only** — gated by the existing `audit_logs` feature permission
- Non-admin professionals do not see the "Historico" tab at all

## Scope

### In Scope
- Inline history on patient detail and appointment editor
- Fill audit logging gaps for appointment/patient operations
- Human-readable field diffs with Portuguese labels
- Pagination

### Out of Scope
- History for other entity types (users, availability, groups)
- Undo/revert functionality
- Real-time updates (history refreshes on tab switch)
- Export/download of history
