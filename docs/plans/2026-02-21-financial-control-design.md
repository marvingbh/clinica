# Financial Control System — Design Document

## Goal

Implement a complete financial control system for the clinic: pre-paid session invoicing, credit management for cancellations, PDF invoice generation with WhatsApp sharing, and per-professional financial dashboards.

## Core Concepts

- **Sessions are pre-paid.** Invoices are generated at the beginning of each month.
- **Credits are session-based.** A cancelled session with notice ("acordado") generates 1 session credit, valued at the patient's current `sessionFee` when consumed.
- **Extra sessions** (unplanned appointments, school meetings) appear on the next month's invoice.
- **Groups** count as regular sessions. Each patient pays their own price.
- **Payment is manual.** Professionals mark invoices as paid. Due date: 15th of the month.

---

## Data Model

### New Models

```prisma
model Invoice {
  id                    String        @id @default(cuid())
  clinicId              String
  professionalProfileId String
  patientId             String
  referenceMonth        Int           // 1-12
  referenceYear         Int           // e.g. 2026
  status                InvoiceStatus @default(PENDENTE)
  totalSessions         Int
  creditsApplied        Int
  extrasAdded           Int
  totalAmount           Decimal       @db.Decimal(10, 2)
  dueDate               DateTime      @db.Date
  paidAt                DateTime?
  notes                 String?
  showAppointmentDays   Boolean       @default(false)
  messageBody           String?       // Rendered template text for this invoice

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic
  professionalProfile ProfessionalProfile
  patient             Patient
  items               InvoiceItem[]

  @@unique([professionalProfileId, patientId, referenceMonth, referenceYear])
}

model InvoiceItem {
  id            String          @id @default(cuid())
  invoiceId     String
  appointmentId String?
  type          InvoiceItemType
  description   String
  quantity      Int             @default(1)
  unitPrice     Decimal         @db.Decimal(10, 2)
  total         Decimal         @db.Decimal(10, 2)

  createdAt DateTime @default(now())

  invoice     Invoice
  appointment Appointment?
}

model SessionCredit {
  id                    String    @id @default(cuid())
  clinicId              String
  professionalProfileId String
  patientId             String
  originAppointmentId   String
  reason                String
  consumedByInvoiceId   String?
  consumedAt            DateTime?

  createdAt DateTime @default(now())

  clinic              Clinic
  professionalProfile ProfessionalProfile
  patient             Patient
  originAppointment   Appointment
  consumedByInvoice   Invoice?
}
```

### New Enums

```prisma
enum InvoiceStatus {
  PENDENTE
  PAGO
  CANCELADO
}

enum InvoiceItemType {
  SESSAO_REGULAR
  SESSAO_EXTRA
  SESSAO_GRUPO
  REUNIAO_ESCOLA
  CREDITO
}
```

### Modified Enums

```prisma
enum AppointmentStatus {
  AGENDADO
  CONFIRMADO
  CANCELADO_ACORDADO      // replaces CANCELADO_PACIENTE — generates credit
  CANCELADO_FALTA         // replaces NAO_COMPARECEU — no credit
  CANCELADO_PROFISSIONAL
  FINALIZADO
}
```

### Modified Models

- **Appointment**: Add `creditGenerated Boolean @default(false)`
- **Patient**: Add `showAppointmentDaysOnInvoice Boolean @default(false)`, add `invoiceMessageTemplate String?`
- **Clinic**: Add `invoiceMessageTemplate String?`

---

## Cancellation Flow

Two distinct cancellation actions in the UI:

| Button | Status | Credit | Use Case |
|--------|--------|--------|----------|
| **Acordado** | `CANCELADO_ACORDADO` | Yes, auto-created | Patient cancelled with advance notice |
| **Falta** | `CANCELADO_FALTA` | No | Patient didn't show or cancelled too late |

- `CANCELADO_PROFISSIONAL` remains for professional-initiated cancellations.
- Status is **editable**: switching from FALTA → ACORDADO creates a credit; ACORDADO → FALTA deletes the credit (if not yet consumed by an invoice).

---

## Invoice Generation Logic

Triggered manually by the professional via "Gerar Faturas" for a target month/year.

### For each patient with appointments in the target month:

1. **Regular sessions**: Appointments from recurrences (`recurrenceId IS NOT NULL`) with status `AGENDADO`, `CONFIRMADO`, or `FINALIZADO`.
2. **Extra sessions**: Appointments without recurrence and without group (`recurrenceId IS NULL AND groupId IS NULL`), type CONSULTA.
3. **Group sessions**: Appointments with `groupId IS NOT NULL`.
4. **School meetings**: REUNIAO appointments linked to the patient.
5. **Available credits**: `SessionCredit` where `consumedByInvoiceId IS NULL`, consumed FIFO (oldest first).

### Calculation:

Each session item is priced at `patient.sessionFee`. Credits are negative items at the same price. Total = sum of all items.

### Idempotency:

If an invoice already exists for (professional, patient, month, year), warn and allow regeneration (delete old, create new).

---

## Invoice Message Template

### Variables:

| Variable | Value |
|----------|-------|
| `{{paciente}}` | Patient name |
| `{{mae}}` | Mother name |
| `{{pai}}` | Father name |
| `{{valor}}` | Invoice total (R$ formatted) |
| `{{mes}}` | Reference month name |
| `{{ano}}` | Reference year |
| `{{vencimento}}` | Due date (DD/MM/YYYY) |
| `{{sessoes}}` | Total session count |
| `{{profissional}}` | Professional name |

### Precedence:

1. Patient-level `invoiceMessageTemplate` (if set)
2. Clinic-level `invoiceMessageTemplate` (fallback)
3. Built-in default (hardcoded)

### Default template:

```
Prezado(a) {{mae}},

Segue a fatura de {{paciente}} referente ao mês de {{mes}}/{{ano}}.

Valor: {{valor}}
Vencimento: {{vencimento}}
Total de sessões: {{sessoes}}

Atenciosamente,
{{profissional}}
```

The rendered text is stored on `Invoice.messageBody` and included in both the PDF and WhatsApp message.

---

## PDF Generation

- Library: `@react-pdf/renderer`
- Endpoint: `GET /api/financeiro/faturas/[id]/pdf`
- Content: clinic header, patient info, rendered message, items table, totals, due date
- If `showAppointmentDays`: each item includes the session date

---

## WhatsApp Sharing

- Endpoint: `POST /api/financeiro/faturas/[id]/enviar`
- Generates PDF, creates a temporary download link
- Sends WhatsApp message with the rendered `messageBody` + PDF link
- Uses existing notification system and WhatsApp provider

---

## API Routes

```
GET    /api/financeiro/faturas              # List invoices
POST   /api/financeiro/faturas/gerar        # Generate invoices for a month
GET    /api/financeiro/faturas/[id]         # Invoice detail with items
PATCH  /api/financeiro/faturas/[id]         # Update status, notes
DELETE /api/financeiro/faturas/[id]         # Cancel/void invoice
GET    /api/financeiro/faturas/[id]/pdf     # Download PDF
POST   /api/financeiro/faturas/[id]/enviar  # Send via WhatsApp

GET    /api/financeiro/creditos             # List credits
GET    /api/financeiro/dashboard            # Summary stats
```

All routes use `withAuth` with resource `"invoice"`. RBAC: professionals see own patients; ADMINs see all.

---

## UI Pages

### `/financeiro` — Dashboard
- Summary cards: total faturado, pendente, pago, credits available
- Monthly breakdown
- Filter by professional (ADMINs)

### `/financeiro/faturas` — Invoice List
- Table with filters (month, status, professional)
- Bulk "Gerar Faturas do Mês" button
- Row actions: view, mark paid, download PDF, send WhatsApp

### `/financeiro/faturas/[id]` — Invoice Detail
- Header with patient, month, status, due date
- Items table with descriptions, prices, totals
- Message body preview
- Actions: mark paid, download PDF, send WhatsApp, cancel, edit notes

### `/financeiro/creditos` — Credits Overview
- Table: patient, reason, created date, status (available/consumed)
- Filter by patient, professional

### Patient Detail Enhancement
- Add "Financeiro" tab: invoices, credits, fee history
- Add `showAppointmentDaysOnInvoice` toggle
- Add `invoiceMessageTemplate` editor

### Appointment Cancellation UI
- Two buttons: "Acordado" (credit) / "Falta" (no credit)
- Editable after the fact

---

## Visibility & RBAC

| Role | Sees | Can Generate | Can Mark Paid |
|------|------|--------------|---------------|
| PROFESSIONAL | Own patients only | Own patients | Own patients |
| ADMIN | All professionals | All | All |

---

## Decisions Summary

| Aspect | Decision |
|--------|----------|
| Credit type | Session-based (1 session, valued at current fee) |
| Generation | Manual trigger |
| Cancellation | ACORDADO (credit) / FALTA (no credit) — two buttons |
| Rescheduling | Cancel + rebook; credits consumed at invoice time |
| Invoice detail | Optional appointment dates (per-patient flag) |
| Payment | Manual status change, due 15th |
| PDF | @react-pdf/renderer |
| Templates | Clinic default + patient override with variables |
| Groups | Each patient pays individually, same credit rules |
| School meetings | Use REUNIAO type linked to patient |
