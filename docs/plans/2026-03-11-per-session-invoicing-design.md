# Per-Session Invoice Grouping — Design Document

## Problem

Currently all invoices are grouped monthly: one invoice per patient per professional per month. Some clinics need one invoice per session, with due date = session date, so each appointment is billed and tracked individually.

## Core Concepts

Two independent dimensions:

| Dimension | Options | Controls |
|-----------|---------|----------|
| **BillingMode** (existing) | `PER_SESSION` / `MONTHLY_FIXED` | **Pricing** — per-session fee vs flat monthly fee |
| **InvoiceGrouping** (new) | `MONTHLY` / `PER_SESSION` | **Grouping** — one invoice per month vs one invoice per session |

**Constraint:** `MONTHLY_FIXED` pricing + `PER_SESSION` grouping is not allowed. Per-session grouping requires per-session pricing.

## Configuration

- **Clinic level:** `invoiceGrouping` field with default `MONTHLY`
- **Patient level:** nullable `invoiceGrouping` override (null = inherit from clinic)
- Both directions: clinic default MONTHLY, patient override PER_SESSION (or vice versa)

## Schema Changes

```prisma
enum InvoiceGrouping {
  MONTHLY
  PER_SESSION
}

enum InvoiceType {
  MONTHLY
  MANUAL
  PER_SESSION  // NEW
}

model Clinic {
  // add:
  invoiceGrouping InvoiceGrouping @default(MONTHLY)
}

model Patient {
  // add:
  invoiceGrouping InvoiceGrouping?  // null = inherit from clinic
}
```

### Indexes

- Composite index on Invoice: `(clinicId, patientId, professionalProfileId, referenceYear, referenceMonth)`
- Partial unique index (raw SQL) on Invoice for MONTHLY type only to prevent duplicates

## Invoice Generation (Gerar Faturas)

When `resolveGrouping(clinic, patient) = PER_SESSION`:

1. Same appointment query as today
2. Instead of grouping into one invoice, create one invoice per appointment
3. Each invoice: `invoiceType: "PER_SESSION"`, `totalSessions: 1`, one InvoiceItem, `dueDate = appointment.scheduledAt`
4. **Credits:** Sort appointments chronologically. Apply available credits to earliest sessions first. Credit fully offsets one session → invoice with R$0, auto-marked PAGO.
5. **Idempotency:** Check `InvoiceItem.appointmentId` globally to prevent double-billing (works across MONTHLY and PER_SESSION types)

When `resolveGrouping = MONTHLY`: unchanged.

## Cancellation Rules (PER_SESSION)

When a session is cancelled (CANCELADO_ACORDADO / CANCELADO_PROFISSIONAL):

1. **No invoice exists yet:** Appointment excluded from future generation (same as today)
2. **Invoice exists, status PENDENTE/ENVIADO:** Cancel the invoice (set CANCELADO)
3. **Invoice exists, status PAGO/PARCIAL:** Create SessionCredit (same as today's credit flow)

## Invoice List UI

Group per-session invoices by patient + referenceMonth + referenceYear:
- Collapsible header row: patient name, aggregated total, derived status, session count
- Expand to see individual session invoices
- `deriveGroupStatus()`: all PAGO → PAGO, all CANCELADO → CANCELADO, mixed → PARCIAL, else PENDENTE

## Ancillary Changes

| Area | Change |
|------|--------|
| Recalculation | Branch by `invoiceType`. PER_SESSION recalculates single linked appointment only |
| ZIP download | Append session date to filename for PER_SESSION: `{month}-{prof}-{patient}-{date}.pdf` |
| Bank reconciliation | Extend `findGroupCandidates` to group same-patient per-session invoices |
| WhatsApp | Add batch send option for per-session monthly summary |
| Dashboard | Aggregate per-session invoices by patient+month for metrics |
| Settings UI | Add "Agrupamento de Faturas" dropdown on clinic + patient settings |
| Mode switching | When clinic changes to MONTHLY_FIXED, null out patient PER_SESSION overrides |
