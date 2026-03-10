# Partial Payments & Many-to-Many Reconciliation

## Context
One invoice can receive multiple partial payments (e.g., R$2160 then R$540 for a R$2700 invoice). One payment can also cover multiple invoices (siblings). The current `reconciledInvoiceId` FK on `BankTransaction` only supports one-to-one links.

## Data Model

### New table: `ReconciliationLink`
```prisma
model ReconciliationLink {
  id                 String   @id @default(cuid())
  transactionId      String
  invoiceId          String
  amount             Decimal  @db.Decimal(10, 2)
  reconciledAt       DateTime
  reconciledByUserId String

  transaction        BankTransaction @relation(fields: [transactionId])
  invoice            Invoice         @relation(fields: [invoiceId])
  reconciledByUser   User            @relation(fields: [reconciledByUserId])
}
```

### Remove from `BankTransaction`
Drop `reconciledInvoiceId`, `reconciledAt`, `reconciledByUserId` — replaced by the junction table.

### New invoice status: `PARCIAL`
Add to `InvoiceStatus` enum, between ENVIADO and PAGO.

### Derived values (computed, not stored)
- Transaction `allocatedAmount` = sum of its links' amounts
- Transaction `remainingAmount` = `amount - allocatedAmount`
- Invoice `paidAmount` = sum of its links' amounts
- Invoice `remainingAmount` = `totalAmount - paidAmount`

### Status transitions
- First link created, `paidAmount < totalAmount` → `PARCIAL`
- `paidAmount >= totalAmount` → `PAGO` (automatic)
- Undo link, `paidAmount` drops to 0 → `PENDENTE`
- Undo link, `0 < paidAmount < totalAmount` → `PARCIAL`

### Migration
1. Create `ReconciliationLink` table
2. For each `BankTransaction` with `reconciledInvoiceId != null`:
   - Create a `ReconciliationLink` with `amount = transaction.amount` (for originals) or appropriate amount (for splits)
   - For split records (`externalId` contains `:split-`): create link, then delete the synthetic record
3. Drop `reconciledInvoiceId`, `reconciledAt`, `reconciledByUserId` from `BankTransaction`

## API

### POST `/api/financeiro/conciliacao/reconcile`
```typescript
// Request
{ links: [{ transactionId: string, invoiceId: string, amount: number }] }

// Response
{ reconciled: number, message: string }
```
Creates `ReconciliationLink` rows. Recalculates each affected invoice's paidAmount and updates status (PARCIAL or PAGO).

### DELETE `/api/financeiro/conciliacao/reconcile`
Supports two modes:
- `{ linkId: string }` — remove a single link
- `{ transactionId: string }` — remove ALL links for a transaction

After removal, recalculates invoice status (PENDENTE, PARCIAL, or PAGO based on remaining links). Any link can be removed regardless of current invoice status (supports refund scenarios).

### GET `/api/financeiro/conciliacao/transactions`
Each transaction returns:
```typescript
{
  ...existingFields,
  allocatedAmount: number,
  remainingAmount: number,
  links: [{ linkId, invoiceId, patientName, amount, referenceMonth, referenceYear }],
  candidates: [...],       // matched against remainingAmount
  groupCandidates: [...]   // matched against remainingAmount
}
```
Invoices with status PENDENTE, ENVIADO, or PARCIAL are eligible candidates. Matching uses invoice `remainingAmount` instead of `totalAmount`.

## UI

### Transaction cards
- Partially allocated transactions (`remainingAmount > 0`) show progress: "R$2.160 / R$2.700 alocado"
- Stay in unreconciled list until fully allocated
- Candidates matched against `remainingAmount`

### Reconciled transaction cards
- Show all links as a list (patient name, invoice ref, allocated amount)
- Individual "Desfazer" button per link
- "Desfazer tudo" button to remove all links at once

### Invoice status badge
- `PARCIAL`: yellow-orange tone, label "Parcial"
- Candidate rows show `remainingAmount` when invoice is PARCIAL

### Smart default amount
- When selecting an invoice: pre-fill `min(transaction.remainingAmount, invoice.remainingAmount)`
- Editable amount field for manual adjustment
- "Confirmar" button shows the amount being allocated

## Files to modify
- `prisma/schema.prisma` — add ReconciliationLink, add PARCIAL to InvoiceStatus, remove FK from BankTransaction
- `prisma/migrations/` — migration script with data migration
- `src/app/api/financeiro/conciliacao/reconcile/route.ts` — rewrite POST/DELETE for junction table
- `src/app/api/financeiro/conciliacao/transactions/route.ts` — return links, compute remaining amounts, match on remaining
- `src/lib/bank-reconciliation/matcher.ts` — accept remaining amounts for matching
- `src/app/financeiro/conciliacao/components/types.ts` — update Transaction interface
- `src/app/financeiro/conciliacao/components/TransactionList.tsx` — handle partial state
- `src/app/financeiro/conciliacao/components/TransactionCard.tsx` — amount field, partial indicator
- `src/app/financeiro/conciliacao/components/UnmatchedTransactionCard.tsx` — amount field
- `src/app/financeiro/conciliacao/components/ReconciledTransactionCard.tsx` — per-link undo
- `src/app/financeiro/conciliacao/components/shared-ui.tsx` — PARCIAL badge
