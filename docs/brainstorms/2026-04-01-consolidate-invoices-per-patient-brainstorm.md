# Brainstorm: Consolidate Invoices Per Patient

**Date:** 2026-04-01
**Status:** Ready for planning

## What We're Building

Change invoice generation to produce **one invoice per patient** (under their reference professional), instead of the current one invoice per patient+professional pair. This eliminates duplicate invoices when a patient has sessions with multiple professionals (e.g., individual therapy + group sessions with a different therapist).

### Real Example
Diogo Henrique has:
- Individual sessions with **Livia** (reference professional)
- Group sessions with **Elena**

**Today:** 2 invoices — one from Livia, one from Elena
**After:** 1 invoice under Livia, with line items tracking Elena as attending professional for the group sessions. Repasse to Elena still works correctly via `InvoiceItem.attendingProfessionalId`.

## Why This Approach

- The `InvoiceItem.attendingProfessionalId` field already exists and supports per-item professional tracking
- The repasse system already resolves per-item via `resolveAttendingProfId()` — no changes needed to repasse calculation
- Parents/guardians receive one consolidated statement instead of confusing duplicates
- The `referenceProfessionalId` on Patient already designates the primary professional

## Key Decisions

1. **Grouping key changes from `patientId|professionalId` to `patientId`** — one invoice per patient per month
2. **Invoice.professionalProfileId = patient's referenceProfessionalId** — always, even if reference professional had zero sessions that month
3. **Fallback when no referenceProfessionalId:** use the professional from the patient's first appointment that month
4. **Applies to both MONTHLY and PER_SESSION grouping** — all invoice types consolidate under reference professional
5. **InvoiceItem.attendingProfessionalId** tracks the actual executing professional per session (already exists)
6. **Repasse unchanged** — already resolves per-item, no changes needed
7. **New generations + regenerations use new logic** — existing invoices untouched unless regenerated
8. **No schema changes needed** — all fields already exist

## Scope of Changes

### API: `/api/financeiro/faturas/gerar/route.ts`
- Change grouping from `patientId|professionalId` to `patientId`
- Resolve invoice's `professionalProfileId` from `patient.referenceProfessionalId` (or fallback)
- Set `attendingProfessionalId` on each InvoiceItem from the appointment's professional

### Lib: `generate-monthly-invoice.ts` / `generate-per-session-invoices.ts`
- Accept appointments from multiple professionals
- Ensure `attendingProfessionalId` is set on each created InvoiceItem
- The `professionalProfileId` param becomes the billing professional (reference), not the session professional

### Existing features that should keep working
- Repasse calculation (uses InvoiceItem.attendingProfessionalId — already correct)
- Invoice PDF/reports (show billing professional on header)
- Invoice detail modal
- Bulk mark as enviado
- Progress streaming during generation

## Open Questions

None — all questions resolved during brainstorming.
