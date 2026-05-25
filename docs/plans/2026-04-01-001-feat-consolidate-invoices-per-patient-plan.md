---
title: "feat: Consolidate invoices per patient under reference professional"
type: feat
status: active
date: 2026-04-01
origin: docs/brainstorms/2026-04-01-consolidate-invoices-per-patient-brainstorm.md
---

# Consolidate Invoices Per Patient Under Reference Professional

## Overview

Change invoice generation from grouping by `patientId|professionalProfileId` (one invoice per patient+professional pair) to grouping by `patientId` only (one invoice per patient). The invoice is attributed to the patient's `referenceProfessionalId`. Each `InvoiceItem` preserves the `attendingProfessionalId` so repasse (payment splits) still routes to the professional who actually delivered the session.

**Real example:** Diogo has individual sessions with Livia (reference professional) and group sessions with Elena. Today: 2 invoices. After: 1 invoice under Livia, with items tracking Elena as attending professional for group sessions.

## Problem Statement

Parents/guardians receive multiple invoices for the same patient when sessions span multiple professionals (common with group therapy). This is confusing and creates administrative overhead. The financial data is correct but poorly organized from the client perspective.

## Proposed Solution

### 1. Change grouping key in `gerar/route.ts`

**File:** `src/app/api/financeiro/faturas/gerar/route.ts` (lines 80-107)

Change from:
```typescript
const key = `${apt.patientId}|${apt.professionalProfileId}`
```
To:
```typescript
const key = apt.patientId
```

This consolidates all appointments for a patient (regardless of which professional delivered them) into a single group.

### 2. Resolve billing professional per patient

After grouping, determine the `professionalProfileId` for each invoice:

```typescript
// For each patient group, determine the billing professional
const patient = patientMap.get(patientId)
const billingProfId = patient?.referenceProfessionalId
  || patientApts[0].professionalProfileId  // fallback: first appointment's professional
```

**Decision (see brainstorm):** Always use `referenceProfessionalId`. Fallback to first session's professional when not set.

### 3. Set `attendingProfessionalId` on every InvoiceItem

Currently `attendingProfessionalId` is only set when there's a substitute (different from invoice professional). After this change, every item should explicitly set it from the appointment's `professionalProfileId`:

```typescript
// In the appointment mapping (lines 157-168)
const mappedApts = patientApts.map(a => ({
  ...existingMapping,
  // Always set attending to the actual session professional
  attendingProfessionalId: a.attendingProfessionalId ?? a.professionalProfileId,
}))
```

This ensures repasse correctly routes to the executing professional even when the invoice is under the reference professional.

### 4. Update `generateMonthlyInvoice` existing invoice lookup

**File:** `src/lib/financeiro/generate-monthly-invoice.ts`

The function looks for existing invoices by `(clinicId, patientId, professionalProfileId, month, year)`. Since `professionalProfileId` now changes from per-session professional to reference professional, the lookup will naturally find consolidated invoices on regeneration.

No signature change needed — just pass the billing `professionalProfileId` (reference professional) instead of the session professional.

### 5. Update `generatePerSessionInvoices` similarly

**File:** `src/lib/financeiro/generate-per-session-invoices.ts`

Pass `profId` as the reference professional. Each per-session invoice will be under the reference professional. The `attendingProfessionalId` on items tracks who delivered the session.

### 6. Repasse — no changes needed

**File:** `src/lib/financeiro/repasse.ts`

The `resolveAttendingProfId()` function already handles this:
```typescript
return item.attendingProfessionalId ?? item.invoiceProfessionalId
```

With the change:
- Items where the reference professional delivered the session: `attendingProfessionalId` = reference prof → repasse goes to them
- Items where another professional delivered: `attendingProfessionalId` = that professional → repasse goes to them

The repasse route aggregates by attending professional, so it will correctly split revenue.

### 7. Add `referenceProfessionalId` to patient fetch

**File:** `src/app/api/financeiro/faturas/gerar/route.ts` (line 115-124)

Add `referenceProfessionalId` to the patient select:
```typescript
select: {
  id: true, name: true, motherName: true, fatherName: true,
  sessionFee: true, showAppointmentDaysOnInvoice: true,
  invoiceDueDay: true, invoiceMessageTemplate: true,
  referenceProfessionalId: true,  // ← ADD THIS
  invoiceGrouping: true,
}
```

## Acceptance Criteria

- [ ] Single invoice per patient per month, regardless of how many professionals delivered sessions
- [ ] Invoice `professionalProfileId` = patient's `referenceProfessionalId` (or fallback to first session's professional)
- [ ] Each `InvoiceItem.attendingProfessionalId` reflects who actually delivered that session
- [ ] Repasse correctly routes to executing professionals (not the billing reference professional)
- [ ] `referenceProfessionalId` fallback works when patient has no reference professional set
- [ ] PER_SESSION grouping also consolidates under reference professional
- [ ] Regenerating existing months uses new consolidated logic
- [ ] Progress streaming still works during generation
- [ ] Invoice PDF/detail shows correct billing professional name
- [ ] No schema/migration changes needed

## Edge Cases

| Case | Handling |
|------|----------|
| Patient has no `referenceProfessionalId` | Use `professionalProfileId` from their first appointment that month |
| Patient has sessions with 3+ professionals | All consolidated into one invoice under reference professional |
| Reference professional has no sessions with patient | Invoice still created under them; all items have `attendingProfessionalId` set |
| Prior uninvoiced appointments from different professional | Included in the consolidated invoice, `attendingProfessionalId` preserved |
| Existing invoice already generated with old logic | Regeneration will find and update it (or create new if professional changed) |

## Files to Modify

1. **`src/app/api/financeiro/faturas/gerar/route.ts`** — grouping key, billing professional resolution, patient select
2. **`src/lib/financeiro/generate-monthly-invoice.ts`** — ensure `attendingProfessionalId` is always set on items
3. **`src/lib/financeiro/generate-per-session-invoices.ts`** — same as above

## Files That Should NOT Change

- `src/lib/financeiro/repasse.ts` — already handles per-item attending professional
- `src/app/api/financeiro/repasse/route.ts` — aggregation already works per-item
- `prisma/schema.prisma` — no schema changes needed

## Verification

1. Run existing invoice generation tests
2. Test with Diogo's data: generate invoices for a month where he has sessions with both Elena and Livia
3. Verify: one invoice under Livia, items show Elena as attending for group sessions
4. Verify repasse: Elena's repasse includes group session revenue, Livia's includes individual session revenue
5. `npm run build` — no type errors

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-04-01-consolidate-invoices-per-patient-brainstorm.md](docs/brainstorms/2026-04-01-consolidate-invoices-per-patient-brainstorm.md)
- Key decisions carried forward: per-patient grouping, reference professional as billing prof, always set attendingProfessionalId
- Invoice generation: `src/app/api/financeiro/faturas/gerar/route.ts`
- Repasse logic: `src/lib/financeiro/repasse.ts:79-81`
