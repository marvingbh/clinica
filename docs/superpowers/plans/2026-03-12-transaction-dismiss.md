# Transaction Dismiss Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to dismiss bank transactions as DUPLICATE or NOT_PATIENT, removing them from the reconciliation queue with undo capability.

**Architecture:** Add a nullable `dismissReason` enum to `BankTransaction`. New dismiss/undismiss API route. Transactions GET filters out dismissed by default, with `showDismissed` toggle. New `DismissedTransactionCard` UI component. Dismiss buttons added to existing transaction cards.

**Tech Stack:** Prisma (PostgreSQL), Next.js API routes, React, Tailwind CSS, Zod validation

**Spec:** `docs/superpowers/specs/2026-03-12-transaction-dismiss-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `prisma/schema.prisma` | Add enum + 3 fields to BankTransaction, reverse relation on User |
| Create | `prisma/migrations/20260312_add_transaction_dismiss/migration.sql` | Migration SQL |
| Create | `src/app/api/financeiro/conciliacao/dismiss/route.ts` | POST (dismiss) + DELETE (undismiss) endpoints |
| Modify | `src/app/api/financeiro/conciliacao/transactions/route.ts` | Filter dismissed, return `dismissedTransactions` |
| Modify | `src/app/api/financeiro/conciliacao/fetch/route.ts` | Preserve dismissed on re-import |
| Modify | `src/app/financeiro/conciliacao/components/types.ts` | Add DismissReason type + config |
| Create | `src/app/financeiro/conciliacao/components/DismissedTransactionCard.tsx` | Compact dismissed card with undo |
| Modify | `src/app/financeiro/conciliacao/components/shared-ui.tsx` | Add DismissButtons component |
| Modify | `src/app/financeiro/conciliacao/components/TransactionCard.tsx` | Add dismiss buttons to header |
| Modify | `src/app/financeiro/conciliacao/components/UnmatchedTransactionCard.tsx` | Add dismiss buttons to header |
| Modify | `src/app/financeiro/conciliacao/components/TransactionList.tsx` | Add dismissed state, toggle, handlers |

---

## Chunk 1: Schema + Migration + API

### Task 1: Add Prisma Schema Changes

**Files:**
- Modify: `prisma/schema.prisma:836-856` (BankTransaction model)
- Modify: `prisma/schema.prisma:220-245` (User model)

- [ ] **Step 1: Add the TransactionDismissReason enum**

Add before the BankTransaction model (around line 835):

```prisma
enum TransactionDismissReason {
  DUPLICATE
  NOT_PATIENT
}
```

- [ ] **Step 2: Add dismiss fields to BankTransaction**

Add these fields inside the BankTransaction model, after the `type` field (after line 845):

```prisma
  dismissReason     TransactionDismissReason?
  dismissedAt       DateTime?
  dismissedByUserId String?
  dismissedByUser   User?    @relation("DismissedTransactions", fields: [dismissedByUserId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Add reverse relation on User model**

Add inside the User model, after the `reconciliationLinks` relation (after line 238):

```prisma
  dismissedTransactions BankTransaction[] @relation("DismissedTransactions")
```

- [ ] **Step 4: Create manual migration file**

Create `prisma/migrations/20260312_add_transaction_dismiss/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "TransactionDismissReason" AS ENUM ('DUPLICATE', 'NOT_PATIENT');

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "dismissReason" "TransactionDismissReason",
ADD COLUMN "dismissedAt" TIMESTAMP(3),
ADD COLUMN "dismissedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Generate Prisma client**

Run: `npx prisma generate`
Expected: Client generated without errors. The migration SQL will be applied via `prisma migrate dev` or `prisma migrate deploy` at build time. Do NOT use `prisma db push` (it breaks production migration history).

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -f prisma/schema.prisma prisma/migrations/20260312_add_transaction_dismiss/migration.sql
git commit -m "feat: add TransactionDismissReason enum and fields to BankTransaction"
```

---

### Task 2: Create Dismiss API Route

**Files:**
- Create: `src/app/api/financeiro/conciliacao/dismiss/route.ts`

- [ ] **Step 1: Create the dismiss route file**

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const dismissSchema = z.object({
  transactionId: z.string(),
  reason: z.enum(["DUPLICATE", "NOT_PATIENT"]),
})

const undismissSchema = z.object({
  transactionId: z.string(),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = dismissSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { transactionId, reason } = parsed.data

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, clinicId: user.clinicId },
      include: { reconciliationLinks: { take: 1 } },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      )
    }

    if (transaction.reconciliationLinks.length > 0) {
      return NextResponse.json(
        { error: "Não é possível descartar uma transação já conciliada" },
        { status: 400 }
      )
    }

    if (transaction.dismissReason) {
      return NextResponse.json(
        { error: "Transação já descartada" },
        { status: 400 }
      )
    }

    await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        dismissReason: reason,
        dismissedAt: new Date(),
        dismissedByUserId: user.id,
      },
    })

    return NextResponse.json({ success: true })
  }
)

export const DELETE = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = undismissSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { transactionId } = parsed.data

    const transaction = await prisma.bankTransaction.findFirst({
      where: {
        id: transactionId,
        clinicId: user.clinicId,
        dismissReason: { not: null },
      },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: "Transação descartada não encontrada" },
        { status: 404 }
      )
    }

    await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        dismissReason: null,
        dismissedAt: null,
        dismissedByUserId: null,
      },
    })

    return NextResponse.json({ success: true })
  }
)
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/financeiro/conciliacao/dismiss/route.ts
git commit -m "feat: add dismiss/undismiss API endpoints for bank transactions"
```

---

### Task 3: Update Transactions GET Route

**Files:**
- Modify: `src/app/api/financeiro/conciliacao/transactions/route.ts:34-58` (transaction query)
- Modify: `src/app/api/financeiro/conciliacao/transactions/route.ts:218-222` (response)

- [ ] **Step 1: Add showDismissed param parsing**

After the existing `showReconciled` param parsing (around line 32), add:

```typescript
const showDismissed = searchParams.get("showDismissed") === "true"
```

- [ ] **Step 2: Add dismissReason filter to transaction query**

In the `prisma.bankTransaction.findMany` call (around line 34), add `dismissReason: null` to the `where` clause so only non-dismissed transactions are fetched for matching. The where clause should become:

```typescript
where: {
  clinicId: user.clinicId,
  type: "CREDIT",
  dismissReason: null,
},
```

- [ ] **Step 3: Add dismissed transactions query**

After the main `Promise.all` block (around line 86), add a conditional query for dismissed transactions:

```typescript
const dismissedTransactions = showDismissed
  ? await prisma.bankTransaction.findMany({
      where: {
        clinicId: user.clinicId,
        type: "CREDIT",
        dismissReason: { not: null },
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        externalId: true,
        date: true,
        amount: true,
        description: true,
        payerName: true,
        dismissReason: true,
        dismissedAt: true,
      },
    })
  : []
```

- [ ] **Step 4: Include dismissedTransactions in response**

At the end of the route handler, update the response to include the dismissed array. Change the final `NextResponse.json` to include:

```typescript
return NextResponse.json({
  transactions: mapped,
  ...(showDismissed && dismissedTransactions.length > 0
    ? { dismissedTransactions: dismissedTransactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })) }
    : {}),
})
```

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/financeiro/conciliacao/transactions/route.ts
git commit -m "feat: filter dismissed transactions from GET, add showDismissed param"
```

---

### Task 4: Update Fetch Route to Preserve Dismissed

**Files:**
- Modify: `src/app/api/financeiro/conciliacao/fetch/route.ts:69-74`

- [ ] **Step 1: Add dismissReason filter to deleteMany**

Change the existing `deleteMany` call (lines 69–74) from:

```typescript
await prisma.bankTransaction.deleteMany({
  where: {
    clinicId: user.clinicId,
    reconciliationLinks: { none: {} },
  },
})
```

To:

```typescript
await prisma.bankTransaction.deleteMany({
  where: {
    clinicId: user.clinicId,
    reconciliationLinks: { none: {} },
    dismissReason: null,
  },
})
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/financeiro/conciliacao/fetch/route.ts
git commit -m "fix: preserve dismissed transactions during bank statement re-import"
```

---

## Chunk 2: Frontend Types + Components

### Task 5: Update Frontend Types

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/types.ts:44-57` (Transaction type)
- Modify: `src/app/financeiro/conciliacao/components/types.ts:59-87` (configs)

- [ ] **Step 1: Add DismissReason type and config**

After the existing `CONFIDENCE_CONFIG` (around line 87), add:

```typescript
export type DismissReason = "DUPLICATE" | "NOT_PATIENT"

export const DISMISS_REASON_CONFIG: Record<DismissReason, { label: string; badgeClassName: string }> = {
  DUPLICATE: { label: "Duplicado", badgeClassName: "bg-amber-50 text-amber-700 border-amber-200" },
  NOT_PATIENT: { label: "Sem relação", badgeClassName: "bg-gray-50 text-gray-600 border-gray-200" },
}
```

- [ ] **Step 2: Add DismissedTransaction type**

After the DismissReason config, add:

```typescript
export interface DismissedTransaction {
  id: string
  externalId: string
  date: string
  amount: number
  description: string
  payerName: string | null
  dismissReason: DismissReason
  dismissedAt: string
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/financeiro/conciliacao/components/types.ts
git commit -m "feat: add DismissReason type and DismissedTransaction interface"
```

---

### Task 6: Add DismissButtons to shared-ui

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/shared-ui.tsx`

- [ ] **Step 1: Add DismissButtons component**

At the end of the file (after the last component), add:

```typescript
export function DismissButtons({ onDismiss }: { onDismiss: (reason: "DUPLICATE" | "NOT_PATIENT") => void }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onDismiss("DUPLICATE")}
        className="text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
        title="Marcar como duplicado"
      >
        Duplicado
      </button>
      <button
        type="button"
        onClick={() => onDismiss("NOT_PATIENT")}
        className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
        title="Sem relação com paciente"
      >
        Sem relação
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/financeiro/conciliacao/components/shared-ui.tsx
git commit -m "feat: add DismissButtons reusable component"
```

---

### Task 7: Create DismissedTransactionCard

**Files:**
- Create: `src/app/financeiro/conciliacao/components/DismissedTransactionCard.tsx`
- Reference: `src/app/financeiro/conciliacao/components/ReconciledTransactionCard.tsx` (pattern to follow)

- [ ] **Step 1: Create the component**

```typescript
"use client"

import { DismissedTransaction, DISMISS_REASON_CONFIG } from "./types"

interface DismissedTransactionCardProps {
  transaction: DismissedTransaction
  onUndismiss: (transactionId: string) => void
}

export function DismissedTransactionCard({ transaction, onUndismiss }: DismissedTransactionCardProps) {
  const config = DISMISS_REASON_CONFIG[transaction.dismissReason]

  return (
    <div className="p-4 border border-border rounded-lg opacity-60 hover:opacity-100 transition-opacity">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-foreground whitespace-nowrap">
            R$ {transaction.amount.toFixed(2)}
          </span>
          <span className="text-sm text-muted-foreground">
            {new Date(transaction.date).toLocaleDateString("pt-BR")}
          </span>
          {transaction.payerName && (
            <span className="text-sm text-muted-foreground truncate">
              {transaction.payerName}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${config.badgeClassName}`}>
            {config.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onUndismiss(transaction.id)}
          className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
        >
          Desfazer
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1 truncate">{transaction.description}</p>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/financeiro/conciliacao/components/DismissedTransactionCard.tsx
git commit -m "feat: add DismissedTransactionCard component"
```

---

## Chunk 3: Wire Dismiss Into Existing Cards + TransactionList

### Task 8: Add Dismiss Buttons to UnmatchedTransactionCard

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/UnmatchedTransactionCard.tsx:10-19` (props)
- Modify: `src/app/financeiro/conciliacao/components/UnmatchedTransactionCard.tsx:55-77` (header buttons)

- [ ] **Step 1: Add onDismiss prop to the interface**

Add `onDismiss` to the component's props interface:

```typescript
onDismiss: (transactionId: string, reason: "DUPLICATE" | "NOT_PATIENT") => void
```

- [ ] **Step 2: Add import for DismissButtons**

Add to imports:

```typescript
import { DismissButtons } from "./shared-ui"
```

- [ ] **Step 3: Add DismissButtons to the header**

In the action buttons area (around line 55–77), add `DismissButtons` next to the existing "Buscar" and "Criar" buttons:

```typescript
<DismissButtons onDismiss={(reason) => onDismiss(transaction.id, reason)} />
```

- [ ] **Step 4: Destructure new prop in the component function**

Add `onDismiss` to the destructured props of the component.

- [ ] **Step 5: Commit**

```bash
git add src/app/financeiro/conciliacao/components/UnmatchedTransactionCard.tsx
git commit -m "feat: add dismiss buttons to UnmatchedTransactionCard"
```

---

### Task 9: Add Dismiss Buttons to TransactionCard

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/TransactionCard.tsx:27-37` (props)
- Modify: `src/app/financeiro/conciliacao/components/TransactionCard.tsx:83-105` (header buttons)

- [ ] **Step 1: Add onDismiss prop**

Add to the component's props interface (note: `selectedIds` already exists as a prop):

```typescript
onDismiss: (transactionId: string, reason: "DUPLICATE" | "NOT_PATIENT") => void
```

- [ ] **Step 2: Add import for DismissButtons**

Add to imports:

```typescript
import { DismissButtons } from "./shared-ui"
```

- [ ] **Step 3: Add DismissButtons to the header, conditionally**

In the action buttons area (around lines 83–105), add DismissButtons — shown only when no links exist and nothing is selected:

```typescript
{transaction.links.length === 0 && selectedIds.length === 0 && (
  <DismissButtons onDismiss={(reason) => onDismiss(transaction.id, reason)} />
)}
```

- [ ] **Step 4: Destructure new prop in the component function**

Add `onDismiss` to the destructured props (`selectedIds` is already there).

- [ ] **Step 5: Commit**

```bash
git add src/app/financeiro/conciliacao/components/TransactionCard.tsx
git commit -m "feat: add conditional dismiss buttons to TransactionCard"
```

---

### Task 10: Wire Everything in TransactionList

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/TransactionList.tsx`

This is the largest change — adding state, handlers, toggle, and passing props.

- [ ] **Step 1: Add imports**

Add to imports at the top:

```typescript
import { DismissedTransactionCard } from "./DismissedTransactionCard"
import { DismissedTransaction } from "./types"
```

- [ ] **Step 2: Add state for dismissed transactions**

After existing state hooks (around line 47), add:

```typescript
const [showDismissed, setShowDismissed] = useState(false)
const [dismissedTransactions, setDismissedTransactions] = useState<DismissedTransaction[]>([])
```

- [ ] **Step 3: Add handleDismiss function**

After the existing undo handlers (around line 210), add:

```typescript
const handleDismiss = async (transactionId: string, reason: "DUPLICATE" | "NOT_PATIENT") => {
  try {
    const res = await fetch("/api/financeiro/conciliacao/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, reason }),
    })
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error || "Erro ao descartar transação")
      return
    }
    toast.success(reason === "DUPLICATE" ? "Marcada como duplicada" : "Marcada sem relação")
    onReconciled()
  } catch {
    toast.error("Erro ao descartar transação")
  }
}

const handleUndismiss = async (transactionId: string) => {
  try {
    const res = await fetch("/api/financeiro/conciliacao/dismiss", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId }),
    })
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error || "Erro ao restaurar transação")
      return
    }
    toast.success("Transação restaurada")
    onReconciled()
  } catch {
    toast.error("Erro ao restaurar transação")
  }
}
```

Note: `onReconciled` is the existing callback that triggers re-fetching in the parent. Use it for both dismiss and undismiss.

- [ ] **Step 4: Fetch dismissed transactions when toggle is on**

Add a `fetchDismissed` function and a useEffect. The function is called both on toggle-on and after dismiss/undismiss actions:

```typescript
const fetchDismissed = useCallback(async () => {
  if (!showDismissed) return
  try {
    const res = await fetch("/api/financeiro/conciliacao/transactions?showDismissed=true")
    const data = await res.json()
    setDismissedTransactions(data.dismissedTransactions || [])
  } catch {
    toast.error("Erro ao carregar transações descartadas")
  }
}, [showDismissed])

useEffect(() => {
  if (showDismissed) {
    fetchDismissed()
  } else {
    setDismissedTransactions([])
  }
}, [showDismissed, fetchDismissed])
```

Then update `handleDismiss` and `handleUndismiss` to also call `fetchDismissed()` after `onReconciled()` so the dismissed list refreshes.

- [ ] **Step 5: Add "Mostrar descartados" toggle**

In the stats/controls bar area (around lines 214–237), add a toggle next to the existing "Mostrar conciliados" toggle:

```typescript
<label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
  <input
    type="checkbox"
    checked={showDismissed}
    onChange={(e) => setShowDismissed(e.target.checked)}
    className="rounded border-input"
  />
  Mostrar descartados
</label>
```

- [ ] **Step 6: Pass onDismiss to TransactionCard**

In the `withMatches` rendering section (around lines 249–266), add the new prop to each `TransactionCard` (note: `selectedIds` is already being passed):

```typescript
onDismiss={handleDismiss}
```

- [ ] **Step 7: Pass onDismiss to UnmatchedTransactionCard**

In the `withoutMatches` rendering section (around lines 268–285), add:

```typescript
onDismiss={handleDismiss}
```

- [ ] **Step 8: Add dismissed transactions section at the bottom**

After the reconciled section (around line 299), add:

```typescript
{showDismissed && dismissedTransactions.length > 0 && (
  <div className="space-y-3">
    <h3 className="text-sm font-medium text-muted-foreground">
      Descartados ({dismissedTransactions.length})
    </h3>
    {dismissedTransactions.map((tx) => (
      <DismissedTransactionCard
        key={tx.id}
        transaction={tx}
        onUndismiss={handleUndismiss}
      />
    ))}
  </div>
)}
```

- [ ] **Step 9: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 10: Run all tests**

Run: `npm run test`
Expected: All tests pass (no existing tests should break).

- [ ] **Step 11: Commit**

```bash
git add src/app/financeiro/conciliacao/components/TransactionList.tsx
git commit -m "feat: wire dismiss/undismiss flow in TransactionList with toggle"
```

---

## Chunk 4: Final Verification

### Task 11: End-to-End Verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No errors.
