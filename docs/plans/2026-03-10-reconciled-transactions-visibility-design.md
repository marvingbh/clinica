# Show & Manage Reconciled Transactions

## Context
Users need to see already-reconciled bank transactions and either undo the reconciliation or swap the linked invoice.

## Design

### Toggle visibility
- `EyeIcon` toggle in the stats bar, labeled "Conciliadas" — shows/hides reconciled transactions. Off by default.

### Reconciled transaction cards
- Same card layout with `opacity-60` + green left border (`border-l-4 border-green-500`)
- Shows linked invoice name + amount inline (read-only, no checkbox)
- Two action buttons:
  - **Desfazer** (`Undo2Icon`, ghost) — unlinks, reverts invoice to previous status, deletes split records
  - **Buscar** / **Criar** — same as unmatched cards; selecting a new invoice swaps the link

### API: `DELETE /api/financeiro/conciliacao/reconcile`
- Accepts `{ transactionId }`
- Clears `reconciledInvoiceId`, `reconciledAt`, `reconciledByUserId`
- Reverts linked invoice status from PAGO to PENDENTE (or ENVIADO if it was ENVIADO before)
- Deletes split bank transaction records (`externalId` containing `:split-`)

### Swap flow
1. Call DELETE to undo current reconciliation
2. Call POST to reconcile with new invoice
3. UI handles as single action

## Files to modify
- `src/app/api/financeiro/conciliacao/reconcile/route.ts` — add DELETE handler
- `src/app/api/financeiro/conciliacao/transactions/route.ts` — support `showReconciled` param (already exists)
- `src/app/financeiro/conciliacao/components/TransactionList.tsx` — add toggle, reconciled cards, undo/swap actions
- `src/app/financeiro/conciliacao/page.tsx` — pass showReconciled state to transactions fetch
