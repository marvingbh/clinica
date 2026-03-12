# Usual Payers for Conciliation Auto-Match

## Problem

In bank reconciliation, many patients are paid for by companies or third parties (e.g., corporate benefits, insurance-like arrangements). The payer name on the bank transaction has no relation to the patient's name or parents' names, so the matching algorithm assigns LOW or no confidence. The user must manually search and link these every month.

## Solution

Introduce **usual payers** — a learned list of normalized payer names per patient. When a reconciliation is confirmed, the system automatically stores the payer name as a usual payer for that patient. On future transactions, the matcher checks usual payers first and assigns a new **KNOWN** confidence level (above HIGH), making these matches automatic over time.

## Data Model

New `PatientUsualPayer` model:

```prisma
model PatientUsualPayer {
  id         String   @id @default(cuid())
  patientId  String
  clinicId   String
  payerName  String   // Normalized (lowercase, no accents, collapsed whitespace)
  createdAt  DateTime @default(now())

  patient Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)
  clinic  Clinic  @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@unique([patientId, payerName])
  @@index([clinicId, payerName])
}
```

- A patient can have many usual payers (one-to-many).
- `payerName` is stored normalized using the existing `normalizeForComparison()` function.
- `@@unique([patientId, payerName])` prevents duplicates per patient.
- `@@index([clinicId, payerName])` enables fast lookup during matching.

Relations added to existing models:
- `Patient.usualPayers: PatientUsualPayer[]`
- `Clinic.patientUsualPayers: PatientUsualPayer[]`

## Auto-Save on Confirmation

In `POST /api/financeiro/conciliacao/reconcile`:

1. After creating `ReconciliationLink` rows (inside the same Prisma transaction):
2. For each link, resolve the patient via `invoice.patientId`.
3. If the transaction has a `payerName` and the invoice has a `patientId`:
   - Normalize the payer name with `normalizeForComparison()`.
   - Upsert into `PatientUsualPayer` (skip if already exists via `@@unique` constraint).
4. Skip if `payerName` is null or `patientId` is null (manual invoices without patients).

This is a fire-and-forget upsert — no error if the entry already exists.

## Matching Enhancement

### New Confidence Level: KNOWN

Added above HIGH in the confidence hierarchy:

| Level  | Score | Meaning |
|--------|-------|---------|
| KNOWN  | 2.0   | Transaction payer matches a patient's usual payer |
| HIGH   | 1.0   | Strong name overlap (parent + patient, or exact match) |
| MEDIUM | 0.5+  | Surname match or partial overlap |
| LOW    | <0.5  | Weak or no name match |

### Matching Flow Change in `matcher.ts`

The `matchTransactions` function receives an optional third parameter: a map of usual payers for the clinic.

```typescript
export function matchTransactions(
  transactions: TransactionForMatching[],
  invoices: InvoiceForMatching[],
  usualPayersMap?: Map<string, Set<string>>  // normalizedPayerName → Set<patientId>
): MatchResult[]
```

The parameter is optional for backward compatibility with existing tests.

**Lookup logic** for each candidate invoice:
1. Look up the transaction's normalized payer name in `usualPayersMap`.
2. If found, check if the invoice's `patientId` is in the returned `Set<string>`.
3. **If yes**: Assign confidence = KNOWN, score = 2.0. Skip further name analysis.
4. **If no**: Proceed with existing name-similarity logic (HIGH/MEDIUM/LOW).

**Sort order**: The existing `order` map in the sort comparator must be updated:
```typescript
const order: Record<MatchConfidence, number> = { KNOWN: -1, HIGH: 0, MEDIUM: 1, LOW: 2 }
```
This ensures KNOWN > HIGH > MEDIUM > LOW.

### Data Loading

The `GET /api/financeiro/conciliacao/transactions` route loads all `PatientUsualPayer` records for the clinic and passes them to `matchTransactions()` as a lookup map:

```typescript
Map<string, Set<string>>  // normalizedPayerName → Set<patientId>
```

This is a single query, cached for the request duration.

## UI Changes

### ConfidenceBadge

Add KNOWN to the confidence config in `types.ts`:

```typescript
KNOWN: { label: "Pagador usual", color: "blue", dotColor: "bg-blue-500" }
```

Blue distinguishes it from HIGH (green). The label "Pagador usual" communicates that this is a learned association.

No other UI changes — no new buttons, screens, or interaction flows.

## Type Changes

The `MatchConfidence` type in `src/lib/bank-reconciliation/types.ts` must be updated:
```typescript
export type MatchConfidence = "KNOWN" | "HIGH" | "MEDIUM" | "LOW"
```

The frontend `Candidate` type in `src/app/financeiro/conciliacao/components/types.ts` must also include `"KNOWN"` in its `confidence` field, and the `CONFIDENCE_CONFIG` must include the KNOWN entry.

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | New `PatientUsualPayer` model, relations on Patient and Clinic |
| `prisma/migrations/...` | Migration file for new table |
| `src/lib/bank-reconciliation/types.ts` | Add `"KNOWN"` to `MatchConfidence` type |
| `src/lib/bank-reconciliation/matcher.ts` | KNOWN confidence level, usual payer lookup, sort order map |
| `src/lib/bank-reconciliation/matcher.test.ts` | Tests for KNOWN matching |
| `src/app/api/financeiro/conciliacao/reconcile/route.ts` | Auto-save usual payer on confirmation |
| `src/app/api/financeiro/conciliacao/transactions/route.ts` | Load usual payers, pass to matcher |
| `src/app/financeiro/conciliacao/components/types.ts` | Add `"KNOWN"` to `Candidate.confidence` and `CONFIDENCE_CONFIG` |
| `src/app/financeiro/conciliacao/components/shared-ui.tsx` | KNOWN color in ConfidenceBadge |

## Edge Cases

- **Null payerName**: Some transactions may not have a payer name extracted. Skip upsert.
- **Invoice.patientId**: In the current schema `patientId` is required on Invoice, so this is always available. The null check is a defensive guard only.
- **Multiple patients with same usual payer**: Possible and valid (e.g., a company pays for multiple employees). Each patient gets their own `PatientUsualPayer` row. The matcher will return KNOWN candidates for all matching patients — the amount-matching logic still narrows it down.
- **Payer name variations**: Bank data may have slight variations ("EMPRESA XYZ" vs "EMPRESA XYZ LTDA"). Normalization handles case/accents but not abbreviations. Over time, multiple variants get stored as separate usual payers, which is acceptable.
- **Group candidates**: KNOWN confidence applies only to individual candidate matching, not to `findGroupCandidates` or `findSamePatientGroups`. Group matching already works via parent name overlap and is unaffected. If a company payer matches individual invoices via KNOWN, those will rank above any group suggestions.
- **Undo reconciliation**: When a reconciliation link is deleted (via DELETE endpoint), the usual payer association is **not** removed. This is intentional — the association may be correct even if one specific reconciliation was undone. Incorrect payers can be cleaned up in a future patient management UI if needed.
