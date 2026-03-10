# Partial Payments & Many-to-Many Reconciliation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 1:1 `reconciledInvoiceId` FK with a junction table `ReconciliationLink` so one invoice can receive multiple partial payments and one payment can cover multiple invoices.

**Architecture:** New `ReconciliationLink(transactionId, invoiceId, amount)` junction table replaces `reconciledInvoiceId` on `BankTransaction`. Invoice gains `PARCIAL` status. Status transitions are automatic based on `sum(link amounts)` vs `totalAmount`. Existing reconciled data is migrated.

**Tech Stack:** Prisma (schema + migration), Next.js API routes, React components, Vitest

---

### Task 1: Schema — Add ReconciliationLink model and PARCIAL status

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add PARCIAL to InvoiceStatus enum**

In `prisma/schema.prisma`, find the `InvoiceStatus` enum (~line 92) and add `PARCIAL`:

```prisma
enum InvoiceStatus {
  PENDENTE
  ENVIADO
  PARCIAL
  PAGO
  CANCELADO
}
```

**Step 2: Add ReconciliationLink model**

Add after the `BankTransaction` model (~line 834):

```prisma
model ReconciliationLink {
  id                 String   @id @default(cuid())
  clinicId           String
  transactionId      String
  invoiceId          String
  amount             Decimal  @db.Decimal(10, 2)
  reconciledAt       DateTime @default(now())
  reconciledByUserId String

  clinic        Clinic          @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  transaction   BankTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  invoice       Invoice         @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  reconciledByUser User         @relation(fields: [reconciledByUserId], references: [id], onDelete: SetNull)

  @@index([transactionId])
  @@index([invoiceId])
  @@index([clinicId])
}
```

**Step 3: Update BankTransaction — remove old FK fields, add relation**

Remove these fields from `BankTransaction`:
- `reconciledInvoiceId String?`
- `reconciledAt DateTime?`
- `reconciledByUserId String?`
- `reconciledInvoice Invoice? @relation(...)`
- `reconciledByUser User? @relation(...)`
- `@@index([reconciledInvoiceId])`

Add:
```prisma
  reconciliationLinks ReconciliationLink[]
```

**Step 4: Update Invoice — replace bankTransactions relation**

Replace:
```prisma
  bankTransactions    BankTransaction[]
```
With:
```prisma
  reconciliationLinks ReconciliationLink[]
```

**Step 5: Update User model — add ReconciliationLink relation**

Add to User model:
```prisma
  reconciliationLinks ReconciliationLink[]
```

**Step 6: Run prisma format**

```bash
npx prisma format
```

**Step 7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add ReconciliationLink table and PARCIAL invoice status"
```

---

### Task 2: Migration — Create table and migrate data

**Files:**
- Create: `prisma/migrations/<timestamp>_add_reconciliation_link/migration.sql`

**Step 1: Create the migration**

```bash
npx prisma migrate dev --name add_reconciliation_link --create-only
```

**Step 2: Edit the generated migration SQL**

The auto-generated migration will try to drop `reconciledInvoiceId` etc. Before the DROP statements, add data migration SQL:

```sql
-- Migrate existing reconciliation data to ReconciliationLink
INSERT INTO "ReconciliationLink" ("id", "clinicId", "transactionId", "invoiceId", "amount", "reconciledAt", "reconciledByUserId")
SELECT
  gen_random_uuid()::text,
  bt."clinicId",
  bt."id",
  bt."reconciledInvoiceId",
  bt."amount",
  COALESCE(bt."reconciledAt", NOW()),
  COALESCE(bt."reconciledByUserId", (SELECT "id" FROM "User" WHERE "clinicId" = bt."clinicId" LIMIT 1))
FROM "BankTransaction" bt
WHERE bt."reconciledInvoiceId" IS NOT NULL;

-- Delete synthetic split records (they are now represented as links)
DELETE FROM "BankTransaction" WHERE "externalId" LIKE '%:split-%';
```

**Step 3: Apply the migration**

```bash
npx prisma migrate dev
```

**Step 4: Generate Prisma client**

```bash
npx prisma generate
```

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat(migration): add ReconciliationLink table with data migration"
```

---

### Task 3: Domain — Invoice status helper

**Files:**
- Create: `src/lib/bank-reconciliation/reconciliation.ts`
- Test: `src/lib/bank-reconciliation/reconciliation.test.ts`
- Modify: `src/lib/bank-reconciliation/index.ts`

**Step 1: Write failing tests**

Create `src/lib/bank-reconciliation/reconciliation.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { computeInvoiceStatus, computeSmartDefault } from "./reconciliation"

describe("computeInvoiceStatus", () => {
  it("returns PENDENTE when paidAmount is 0", () => {
    expect(computeInvoiceStatus(0, 1000)).toBe("PENDENTE")
  })

  it("returns PARCIAL when 0 < paidAmount < totalAmount", () => {
    expect(computeInvoiceStatus(500, 1000)).toBe("PARCIAL")
  })

  it("returns PAGO when paidAmount equals totalAmount", () => {
    expect(computeInvoiceStatus(1000, 1000)).toBe("PAGO")
  })

  it("returns PAGO when paidAmount exceeds totalAmount", () => {
    expect(computeInvoiceStatus(1050, 1000)).toBe("PAGO")
  })

  it("handles decimal precision", () => {
    expect(computeInvoiceStatus(99.99, 100)).toBe("PARCIAL")
    expect(computeInvoiceStatus(100.00, 100)).toBe("PAGO")
  })
})

describe("computeSmartDefault", () => {
  it("returns min of transaction remaining and invoice remaining", () => {
    expect(computeSmartDefault(500, 300)).toBe(300)
    expect(computeSmartDefault(300, 500)).toBe(300)
  })

  it("returns 0 when either is 0", () => {
    expect(computeSmartDefault(0, 500)).toBe(0)
    expect(computeSmartDefault(500, 0)).toBe(0)
  })

  it("handles equal values", () => {
    expect(computeSmartDefault(500, 500)).toBe(500)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/bank-reconciliation/reconciliation.test.ts
```

**Step 3: Implement**

Create `src/lib/bank-reconciliation/reconciliation.ts`:

```typescript
/**
 * Compute the invoice status based on how much has been paid.
 */
export function computeInvoiceStatus(
  paidAmount: number,
  totalAmount: number
): "PENDENTE" | "PARCIAL" | "PAGO" {
  if (paidAmount <= 0) return "PENDENTE"
  if (paidAmount >= totalAmount) return "PAGO"
  return "PARCIAL"
}

/**
 * Compute the smart default amount when linking a transaction to an invoice.
 * Returns min(transactionRemaining, invoiceRemaining).
 */
export function computeSmartDefault(
  transactionRemaining: number,
  invoiceRemaining: number
): number {
  return Math.min(
    Math.max(0, transactionRemaining),
    Math.max(0, invoiceRemaining)
  )
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/bank-reconciliation/reconciliation.test.ts
```

**Step 5: Add to barrel export**

In `src/lib/bank-reconciliation/index.ts`, add:

```typescript
export { computeInvoiceStatus, computeSmartDefault } from "./reconciliation"
```

**Step 6: Commit**

```bash
git add src/lib/bank-reconciliation/reconciliation.ts src/lib/bank-reconciliation/reconciliation.test.ts src/lib/bank-reconciliation/index.ts
git commit -m "feat(domain): add computeInvoiceStatus and computeSmartDefault helpers"
```

---

### Task 4: Domain — Update matcher for remaining amounts

**Files:**
- Modify: `src/lib/bank-reconciliation/types.ts`
- Modify: `src/lib/bank-reconciliation/matcher.ts`
- Modify: `src/lib/bank-reconciliation/matcher.test.ts`

**Step 1: Add remainingAmount to InvoiceForMatching**

In `src/lib/bank-reconciliation/types.ts`, add to `InvoiceForMatching`:

```typescript
export interface InvoiceForMatching {
  // ...existing fields...
  remainingAmount: number  // totalAmount - sum(linked payments)
}
```

**Step 2: Update matcher to use remainingAmount**

In `src/lib/bank-reconciliation/matcher.ts`, change the amount matching in `matchTransactions`:

Replace:
```typescript
    const amountMatches = eligibleInvoices.filter(
      inv => Math.abs(inv.totalAmount - transaction.amount) < 0.01
    )
```
With:
```typescript
    const amountMatches = eligibleInvoices.filter(
      inv => Math.abs(inv.remainingAmount - transaction.amount) < 0.01
    )
```

Also update `VALID_STATUSES`:
```typescript
const VALID_STATUSES = ["PENDENTE", "ENVIADO", "PAGO", "PARCIAL"]
```

And update `findGroupCandidates` to use `remainingAmount`:

Replace:
```typescript
      if (Math.abs(a.totalAmount + b.totalAmount - txAmount) >= 0.01) continue
```
With:
```typescript
      if (Math.abs(a.remainingAmount + b.remainingAmount - txAmount) >= 0.01) continue
```

**Step 3: Update existing tests**

Add `remainingAmount` to `makeInvoice` default:
```typescript
const makeInvoice = (overrides: Partial<InvoiceForMatching> = {}): InvoiceForMatching => ({
  // ...existing fields...
  remainingAmount: 500,
  ...overrides,
})
```

For tests that override `totalAmount`, also override `remainingAmount` to the same value.

Add a new test:
```typescript
it("matches on remainingAmount for partially paid invoices", () => {
  const transactions = [makeTransaction({ amount: 200 })]
  const invoices = [makeInvoice({ totalAmount: 500, remainingAmount: 200 })]
  const results = matchTransactions(transactions, invoices)
  expect(results[0].candidates).toHaveLength(1)
})
```

**Step 4: Update InvoiceWithParent and findGroupCandidates tests**

In `makeInvoiceWithParent`, add `remainingAmount: 250` (same as totalAmount default).

Update the findGroupCandidates test "finds a pair..." to set `remainingAmount` to match `totalAmount`.

**Step 5: Run all matcher tests**

```bash
npx vitest run src/lib/bank-reconciliation/matcher.test.ts
```

**Step 6: Commit**

```bash
git add src/lib/bank-reconciliation/types.ts src/lib/bank-reconciliation/matcher.ts src/lib/bank-reconciliation/matcher.test.ts
git commit -m "feat(matcher): use remainingAmount for partial payment matching"
```

---

### Task 5: API — Rewrite reconcile POST/DELETE routes

**Files:**
- Modify: `src/app/api/financeiro/conciliacao/reconcile/route.ts`

**Step 1: Rewrite POST handler**

Replace the entire POST handler. New request schema:

```typescript
const schema = z.object({
  links: z
    .array(
      z.object({
        transactionId: z.string(),
        invoiceId: z.string(),
        amount: z.number().positive(),
      })
    )
    .min(1, "Selecione pelo menos uma conciliação"),
})
```

Logic:
1. Validate all transactions belong to clinic
2. Validate all invoices belong to clinic and have valid status (PENDENTE, ENVIADO, PARCIAL, PAGO)
3. In a Prisma transaction:
   - Create `ReconciliationLink` rows
   - For each affected invoice, sum all links and call `computeInvoiceStatus`
   - Update invoice status and `paidAt` accordingly

**Step 2: Rewrite DELETE handler**

New request schema supporting both modes:

```typescript
const deleteSchema = z.union([
  z.object({ linkId: z.string() }),
  z.object({ transactionId: z.string() }),
])
```

Logic:
1. Find links to delete (single link by `linkId`, or all links for `transactionId`)
2. In a Prisma transaction:
   - Delete the link(s)
   - For each affected invoice, recalculate `paidAmount` from remaining links
   - Update invoice status (PENDENTE if 0, PARCIAL if partial, PAGO if full)
   - Update `paidAt` (null if not PAGO, set if PAGO)

**Step 3: Build and verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/app/api/financeiro/conciliacao/reconcile/route.ts
git commit -m "feat(api): rewrite reconcile route for ReconciliationLink junction table"
```

---

### Task 6: API — Update transactions GET route

**Files:**
- Modify: `src/app/api/financeiro/conciliacao/transactions/route.ts`

**Step 1: Update Prisma query**

Replace the `include: { reconciledInvoice: ... }` with:

```typescript
include: {
  reconciliationLinks: {
    include: {
      invoice: {
        select: {
          id: true,
          totalAmount: true,
          referenceMonth: true,
          referenceYear: true,
          status: true,
          patient: { select: { name: true } },
        },
      },
    },
  },
},
```

**Step 2: Update invoice query to include PARCIAL**

Add `PARCIAL` to the status filter:

```typescript
OR: [
  { status: { in: ["PENDENTE", "ENVIADO", "PARCIAL"] } },
  { status: "PAGO", reconciliationLinks: { none: {} } },
],
```

Also include `reconciliationLinks` aggregate to compute `remainingAmount`:

```typescript
select: {
  // ...existing fields...
  reconciliationLinks: {
    select: { amount: true },
  },
},
```

**Step 3: Compute remaining amounts in response mapping**

For `invForMatching`, compute `remainingAmount`:

```typescript
const invForMatching: InvoiceForMatching[] = invoices.map((inv) => {
  const paidAmount = inv.reconciliationLinks.reduce(
    (sum, link) => sum + Number(link.amount), 0
  )
  return {
    // ...existing fields...
    totalAmount: Number(inv.totalAmount),
    remainingAmount: Number(inv.totalAmount) - paidAmount,
  }
})
```

For transactions, compute `allocatedAmount` and `remainingAmount`:

```typescript
const allocatedAmount = tx.reconciliationLinks.reduce(
  (sum, link) => sum + Number(link.amount), 0
)
const remainingAmount = txAmount - allocatedAmount
const isFullyReconciled = remainingAmount < 0.01
```

**Step 4: Update response shape**

Replace `reconciledInvoiceId`, `reconciledInvoice` with:

```typescript
return {
  // ...existing fields (no reconciledInvoiceId or reconciledInvoice)...
  allocatedAmount,
  remainingAmount,
  isFullyReconciled,
  links: tx.reconciliationLinks.map((link) => ({
    linkId: link.id,
    invoiceId: link.invoice.id,
    patientName: link.invoice.patient.name,
    amount: Number(link.amount),
    totalAmount: Number(link.invoice.totalAmount),
    referenceMonth: link.invoice.referenceMonth,
    referenceYear: link.invoice.referenceYear,
    status: link.invoice.status,
  })),
  candidates: ..., // only when not fully reconciled
  groupCandidates: ..., // only when not fully reconciled
}
```

**Step 5: Update filtering logic**

Transactions with `remainingAmount > 0` should still show candidates. Only skip candidate matching when `isFullyReconciled`.

For `showReconciled` toggle: show transactions that have at least one link (`reconciliationLinks: { some: {} }`).

**Step 6: Build and verify**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add src/app/api/financeiro/conciliacao/transactions/route.ts
git commit -m "feat(api): return links, remaining amounts, and match on remainingAmount"
```

---

### Task 7: UI — Update types and shared components

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/types.ts`
- Modify: `src/app/financeiro/conciliacao/components/shared-ui.tsx`

**Step 1: Update Transaction interface**

In `types.ts`, replace `reconciledInvoiceId`, `reconciledAt`, `reconciledInvoice` with:

```typescript
export interface ReconciliationLinkInfo {
  linkId: string
  invoiceId: string
  patientName: string
  amount: number
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  status: string
}

export interface Transaction {
  id: string
  externalId: string
  date: string
  amount: number
  description: string
  payerName: string | null
  allocatedAmount: number
  remainingAmount: number
  isFullyReconciled: boolean
  links: ReconciliationLinkInfo[]
  candidates: Candidate[]
  groupCandidates?: GroupCandidate[]
}
```

Remove `ReconciledInvoiceInfo` interface (replaced by `ReconciliationLinkInfo`).

**Step 2: Add PARCIAL to INVOICE_STATUS_CONFIG**

```typescript
export const INVOICE_STATUS_CONFIG: Record<string, { bg: string; label: string }> = {
  PENDENTE: { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pendente" },
  ENVIADO: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Enviado" },
  PARCIAL: { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: "Parcial" },
  PAGO: { bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "Pago" },
}
```

**Step 3: Update CandidateInvoice to include remainingAmount**

```typescript
export interface CandidateInvoice {
  // ...existing fields...
  remainingAmount: number
}
```

**Step 4: Commit**

```bash
git add src/app/financeiro/conciliacao/components/types.ts src/app/financeiro/conciliacao/components/shared-ui.tsx
git commit -m "feat(ui): update types for ReconciliationLink and PARCIAL status"
```

---

### Task 8: UI — Update TransactionList orchestrator

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/TransactionList.tsx`

**Step 1: Update filtering logic**

Replace:
```typescript
const unreconciledTx = transactions.filter(tx => !tx.reconciledInvoiceId)
const reconciledTx = transactions.filter(tx => tx.reconciledInvoiceId)
```
With:
```typescript
const unreconciledTx = transactions.filter(tx => !tx.isFullyReconciled)
const reconciledTx = transactions.filter(tx => tx.isFullyReconciled)
```

**Step 2: Update selections to include amounts**

Change `Selections` type from `Record<string, string[]>` to:

```typescript
type SelectionEntry = { invoiceId: string; amount: number }
type Selections = Record<string, SelectionEntry[]>
```

Update auto-selection logic to include smart default amounts.

**Step 3: Update reconcileMatches call**

Change the POST body from `{ matches: [...] }` to `{ links: [...] }`:

```typescript
const links = Object.entries(selections).flatMap(([transactionId, entries]) =>
  entries.map(({ invoiceId, amount }) => ({ transactionId, invoiceId, amount }))
)
const res = await fetch("/api/financeiro/conciliacao/reconcile", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ links }),
})
```

**Step 4: Update handleUndo**

Send `{ transactionId }` (unchanged — removes all links for that transaction).

**Step 5: Commit**

```bash
git add src/app/financeiro/conciliacao/components/TransactionList.tsx
git commit -m "feat(ui): update TransactionList for link-based reconciliation with amounts"
```

---

### Task 9: UI — Update TransactionCard with amount field

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/TransactionCard.tsx`

**Step 1: Add amount editing**

When a candidate is selected, show an editable amount field next to it. Pre-fill with `computeSmartDefault(tx.remainingAmount, candidate.remainingAmount)`.

Add an `onUpdateAmount` callback prop alongside `onToggleInvoice`.

**Step 2: Show partial allocation indicator**

When `tx.allocatedAmount > 0 && tx.remainingAmount > 0`, show in the header:

```tsx
<span className="text-xs text-orange-600">
  {formatCurrencyBRL(tx.allocatedAmount)} / {formatCurrencyBRL(tx.amount)} alocado
</span>
```

**Step 3: Show existing links**

If `tx.links.length > 0`, render them above candidates with per-link amounts.

**Step 4: Commit**

```bash
git add src/app/financeiro/conciliacao/components/TransactionCard.tsx
git commit -m "feat(ui): add amount field and partial allocation indicator to TransactionCard"
```

---

### Task 10: UI — Update ReconciledTransactionCard with per-link undo

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/ReconciledTransactionCard.tsx`

**Step 1: Render all links**

Replace single `reconciledInvoice` display with a list of `tx.links`:

```tsx
{tx.links.map(link => (
  <div key={link.linkId} className="flex items-center gap-2">
    <div className="text-xs">
      <span className="font-medium">{link.patientName}</span>
      <span className="text-muted-foreground ml-1">
        {getMonthName(link.referenceMonth)}/{link.referenceYear}
      </span>
      <span className="ml-1">{formatCurrencyBRL(link.amount)}</span>
      {link.amount < link.totalAmount && (
        <span className="text-orange-600 ml-1">
          de {formatCurrencyBRL(link.totalAmount)}
        </span>
      )}
    </div>
    <button onClick={() => onUndoLink(link.linkId)} ...>Desfazer</button>
  </div>
))}
```

**Step 2: Add "Desfazer tudo" button**

Keep existing undo button for removing all links at once (sends `{ transactionId }`).

**Step 3: Add onUndoLink prop**

Add `onUndoLink: (linkId: string) => void` prop. In `TransactionList.tsx`, implement:

```typescript
const handleUndoLink = async (linkId: string) => {
  const res = await fetch("/api/financeiro/conciliacao/reconcile", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linkId }),
  })
  // ...error handling, then onReconciled()
}
```

**Step 4: Commit**

```bash
git add src/app/financeiro/conciliacao/components/ReconciledTransactionCard.tsx src/app/financeiro/conciliacao/components/TransactionList.tsx
git commit -m "feat(ui): per-link undo and multi-link display in ReconciledTransactionCard"
```

---

### Task 11: Update UnmatchedTransactionCard

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/UnmatchedTransactionCard.tsx`

**Step 1: Add amount field**

Same pattern as TransactionCard — when an invoice is selected via search or creation, show editable amount pre-filled with smart default.

**Step 2: Show partial allocation**

Same indicator as TransactionCard when `allocatedAmount > 0`.

**Step 3: Commit**

```bash
git add src/app/financeiro/conciliacao/components/UnmatchedTransactionCard.tsx
git commit -m "feat(ui): add amount field to UnmatchedTransactionCard"
```

---

### Task 12: Update page.tsx and fix remaining references

**Files:**
- Modify: `src/app/financeiro/conciliacao/page.tsx`
- Modify: `src/app/financeiro/conciliacao/components/InvoiceSearch.tsx`

**Step 1: Update page.tsx**

The `showReconciled` query param logic stays the same. The `Transaction` type import already comes from `types.ts` — no changes needed if the type was updated in Task 7.

**Step 2: Update InvoiceSearch**

When displaying search results for PARCIAL invoices, show `remainingAmount` alongside `totalAmount`:

```tsx
{inv.status === "PARCIAL" && (
  <span className="text-xs text-orange-600">
    Falta: {formatCurrencyBRL(inv.remainingAmount)}
  </span>
)}
```

**Step 3: Build and run all tests**

```bash
npm run test && npm run build
```

**Step 4: Commit**

```bash
git add src/app/financeiro/conciliacao/
git commit -m "feat(ui): update page and InvoiceSearch for partial payments"
```

---

### Task 13: Update other invoice references for PARCIAL status

**Files:**
- Grep for `InvoiceStatus` usage and update any status-dependent logic

**Step 1: Search for affected code**

```bash
# Find all references to invoice status values
rg "PENDENTE|ENVIADO|PAGO" --type ts -l | grep -v node_modules | grep -v '.test.'
```

Key places to check:
- `src/app/financeiro/faturas/page.tsx` — invoice list filtering/display
- `src/app/financeiro/faturas/[id]/page.tsx` — invoice detail page
- `src/app/api/financeiro/faturas/` — invoice API routes
- Any status badge rendering

**Step 2: Add PARCIAL handling where needed**

- Invoice list should show PARCIAL invoices (probably grouped with PENDENTE/ENVIADO)
- Invoice detail should show paid amount vs total
- Status badges should render PARCIAL with orange styling

**Step 3: Build and test**

```bash
npm run test && npm run build
```

**Step 4: Commit**

```bash
git commit -am "feat: add PARCIAL status support across invoice UI"
```

---

### Task 14: Final verification

**Step 1: Run full test suite**

```bash
npm run test
```

**Step 2: Build**

```bash
npm run build
```

**Step 3: Manual testing checklist**

- [ ] Fetch transactions from bank
- [ ] Reconcile a transaction with full amount match
- [ ] Reconcile a transaction with partial amount (R$2160 for R$2700 invoice)
- [ ] Verify invoice shows PARCIAL status
- [ ] Reconcile remaining amount with second transaction
- [ ] Verify invoice transitions to PAGO
- [ ] Undo a single link — verify status reverts
- [ ] Undo all links — verify status reverts to PENDENTE
- [ ] Reconcile one transaction with multiple invoices (siblings)
- [ ] Toggle reconciled transactions visibility
- [ ] Verify smart default amounts

**Step 4: Commit and push**

```bash
git push
```
