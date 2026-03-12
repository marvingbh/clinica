# Transaction Dismiss Feature — Design Spec

## Problem

Bank transactions that are duplicates or unrelated to patients (rent, supplies, refunds) have no way to be removed from the reconciliation queue. They accumulate and clutter the unmatched list indefinitely.

## Solution

Allow users to dismiss transactions with a reason (`DUPLICATE` or `NOT_PATIENT`). Dismissed transactions disappear from the default view and are viewable via a "show dismissed" toggle, with the ability to undo.

## Data Model

Add a nullable enum and audit fields to `BankTransaction`:

```prisma
enum TransactionDismissReason {
  DUPLICATE
  NOT_PATIENT
}

model BankTransaction {
  // ... existing fields ...
  dismissReason     TransactionDismissReason?
  dismissedAt       DateTime?
  dismissedByUserId String?
  dismissedByUser   User?    @relation("DismissedTransactions", fields: [dismissedByUserId], references: [id], onDelete: SetNull)
}

model User {
  // ... add reverse relation ...
  dismissedTransactions BankTransaction[] @relation("DismissedTransactions")
}
```

- `null` = normal transaction (active, not dismissed)
- `DUPLICATE` = user flagged as duplicate payment
- `NOT_PATIENT` = payment unrelated to patients

`dismissedAt` and `dismissedByUserId` provide minimal audit trail. Named relation (`"DismissedTransactions"`) is needed because `User` already has other relations to reconciliation models.

### Migration

Single migration adding:
- The `TransactionDismissReason` enum
- Three nullable columns on `BankTransaction`

No data migration needed — all existing rows remain `null` (not dismissed).

## API

All dismiss/undismiss endpoints use `withFeatureAuth({ feature: "finances", minAccess: "WRITE" })`.

### POST `/api/financeiro/conciliacao/dismiss`

Dismiss a transaction.

**Input:**
```json
{ "transactionId": "string", "reason": "DUPLICATE" | "NOT_PATIENT" }
```

**Validation:**
- Transaction exists and belongs to user's clinic
- Transaction has no reconciliation links (cannot dismiss a reconciled transaction)
- Transaction is not already dismissed

**Action:** Sets `dismissReason`, `dismissedAt = now()`, `dismissedByUserId = user.id`.

**Response:** `{ success: true }`

### DELETE `/api/financeiro/conciliacao/dismiss`

Undo a dismissal.

**Input:**
```json
{ "transactionId": "string" }
```

**Validation:**
- Transaction exists, belongs to clinic, and is currently dismissed

**Action:** Sets `dismissReason = null`, `dismissedAt = null`, `dismissedByUserId = null`.

**Response:** `{ success: true }`

### GET `/api/financeiro/conciliacao/transactions` — changes

- Add `showDismissed` query param (default `false`)
- Default query filter: `dismissReason IS NULL` (excludes dismissed)
- When `showDismissed=true`, the response becomes `{ transactions: [...non-dismissed...], dismissedTransactions: [...dismissed...] }`. The main `transactions` array always excludes dismissed ones.
- When `showDismissed=false` (default), `dismissedTransactions` is omitted.

### POST `/api/financeiro/conciliacao/fetch` — changes

Currently deletes ALL non-reconciled transactions for the clinic (no date filter) before re-importing fresh data from the bank.

Add `dismissReason: null` to the existing deletion filter to preserve dismissed transactions:
```
DELETE WHERE clinicId = X
  AND reconciliationLinks = none
  AND dismissReason IS NULL
```

This keeps the existing deletion semantics (global, not date-scoped) and simply adds protection for dismissed transactions alongside the existing protection for reconciled ones.

## UI

### Dismiss Actions

**UnmatchedTransactionCard:** Two buttons in the card header area:
- "Duplicado" — dismisses with reason `DUPLICATE`
- "Sem relacao" — dismisses with reason `NOT_PATIENT`

**TransactionCard (matched):** Same two buttons. Hidden when `tx.links.length > 0` (any confirmed reconciliation links exist) OR when the user has selected any candidates for that transaction. Partially reconciled transactions are NOT dismissable since they already have confirmed links.

Both trigger the dismiss API, remove the card from the list optimistically, and show a toast: "Transacao descartada como [Duplicado/Sem relacao]".

### DismissedTransactionCard

New compact card component (similar pattern to `ReconciledTransactionCard`):
- Reduced opacity (60%)
- Shows: amount, date, payer name
- Badge with reason: "Duplicado" (amber) or "Sem relacao" (gray)
- "Desfazer" button to undo the dismissal

### TransactionList Changes

- Add "Mostrar descartados" toggle next to existing "Mostrar conciliados" toggle
- When enabled, renders dismissed transactions in a "Descartados" section at the bottom
- Section header shows count (e.g., "Descartados (3)")

### Frontend Types

Add to `types.ts`:
```typescript
export type DismissReason = "DUPLICATE" | "NOT_PATIENT"

// Badge styling only — card-level opacity is applied separately on DismissedTransactionCard
export const DISMISS_REASON_CONFIG: Record<DismissReason, { label: string; badgeClassName: string }> = {
  DUPLICATE: { label: "Duplicado", badgeClassName: "bg-amber-50 text-amber-700 border-amber-200" },
  NOT_PATIENT: { label: "Sem relação", badgeClassName: "bg-gray-50 text-gray-600 border-gray-200" },
}
```

Extend `Transaction` type with optional dismiss fields:
```typescript
dismissReason?: DismissReason | null
dismissedAt?: string | null
```

## Edge Cases

- **Dismiss then re-fetch:** Dismissed transactions are preserved (not deleted by fetch). If the bank returns the same transaction again, `externalId` matching prevents duplicates.
- **Dismiss a transaction with candidates:** Allowed. The candidates are irrelevant if the user knows it's not a patient payment.
- **Undo dismiss:** Transaction returns to normal unreconciled state and reappears in the default list.
- **Cannot dismiss reconciled transactions:** If a transaction already has reconciliation links, the dismiss button is not shown (or API rejects).

## Testing

- **Domain logic:** No new pure functions needed — this is a CRUD status change
- **API tests (if added):** Dismiss, undo, filter by showDismissed, fetch preserves dismissed
- **Key validation tests:** Cannot dismiss reconciled transaction, cannot dismiss already-dismissed, undo works
