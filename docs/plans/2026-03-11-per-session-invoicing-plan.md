# Per-Session Invoice Grouping — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow clinics to generate one invoice per session instead of one per month, configurable at clinic and patient level.

**Architecture:** New `InvoiceGrouping` enum on Clinic/Patient, new `PER_SESSION` value in `InvoiceType`, generation strategy extraction, and UI grouping in the invoice list.

**Tech Stack:** Next.js 16, Prisma, PostgreSQL, React, Vitest

---

### Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add InvoiceGrouping enum and fields**

```prisma
enum InvoiceGrouping {
  MONTHLY
  PER_SESSION
}
```

Add to Clinic model (after `billingMode`):
```prisma
invoiceGrouping InvoiceGrouping @default(MONTHLY)
```

Add to Patient model (after `invoiceDueDay`):
```prisma
invoiceGrouping InvoiceGrouping?
```

**Step 2: Add PER_SESSION to InvoiceType enum**

```prisma
enum InvoiceType {
  MONTHLY
  MANUAL
  PER_SESSION
}
```

**Step 3: Add composite index on Invoice**

```prisma
@@index([clinicId, patientId, professionalProfileId, referenceYear, referenceMonth])
```

**Step 4: Apply schema**

Run: `npx prisma db push`

**Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add InvoiceGrouping enum and PER_SESSION invoice type"
```

---

### Task 2: Domain Module — invoice-grouping.ts

**Files:**
- Create: `src/lib/financeiro/invoice-grouping.ts`
- Create: `src/lib/financeiro/invoice-grouping.test.ts`
- Modify: `src/lib/financeiro/index.ts` (barrel export)

**Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest"
import {
  resolveGrouping,
  isGroupingAllowed,
  deriveGroupStatus,
} from "./invoice-grouping"

describe("resolveGrouping", () => {
  it("returns patient override when set", () => {
    expect(resolveGrouping("MONTHLY", "PER_SESSION")).toBe("PER_SESSION")
    expect(resolveGrouping("PER_SESSION", "MONTHLY")).toBe("MONTHLY")
  })

  it("falls back to clinic default when patient is null", () => {
    expect(resolveGrouping("PER_SESSION", null)).toBe("PER_SESSION")
    expect(resolveGrouping("MONTHLY", null)).toBe("MONTHLY")
  })
})

describe("isGroupingAllowed", () => {
  it("allows PER_SESSION grouping with PER_SESSION billing", () => {
    expect(isGroupingAllowed("PER_SESSION", "PER_SESSION")).toBe(true)
  })

  it("rejects PER_SESSION grouping with MONTHLY_FIXED billing", () => {
    expect(isGroupingAllowed("MONTHLY_FIXED", "PER_SESSION")).toBe(false)
  })

  it("allows MONTHLY grouping with any billing mode", () => {
    expect(isGroupingAllowed("PER_SESSION", "MONTHLY")).toBe(true)
    expect(isGroupingAllowed("MONTHLY_FIXED", "MONTHLY")).toBe(true)
  })
})

describe("deriveGroupStatus", () => {
  it("returns PAGO when all are PAGO", () => {
    expect(deriveGroupStatus(["PAGO", "PAGO", "PAGO"])).toBe("PAGO")
  })

  it("returns CANCELADO when all are CANCELADO", () => {
    expect(deriveGroupStatus(["CANCELADO", "CANCELADO"])).toBe("CANCELADO")
  })

  it("returns PARCIAL when mixed paid/unpaid", () => {
    expect(deriveGroupStatus(["PAGO", "PENDENTE"])).toBe("PARCIAL")
  })

  it("returns PENDENTE when all PENDENTE", () => {
    expect(deriveGroupStatus(["PENDENTE", "PENDENTE"])).toBe("PENDENTE")
  })

  it("returns ENVIADO when all ENVIADO", () => {
    expect(deriveGroupStatus(["ENVIADO", "ENVIADO"])).toBe("ENVIADO")
  })

  it("ignores CANCELADO in mixed statuses", () => {
    expect(deriveGroupStatus(["PAGO", "CANCELADO"])).toBe("PAGO")
    expect(deriveGroupStatus(["PENDENTE", "CANCELADO"])).toBe("PENDENTE")
  })

  it("returns CANCELADO for empty list", () => {
    expect(deriveGroupStatus([])).toBe("CANCELADO")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/financeiro/invoice-grouping.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement**

```typescript
type BillingMode = "PER_SESSION" | "MONTHLY_FIXED"
type InvoiceGrouping = "MONTHLY" | "PER_SESSION"
type InvoiceStatus = "PENDENTE" | "ENVIADO" | "PARCIAL" | "PAGO" | "CANCELADO"

export function resolveGrouping(
  clinicGrouping: InvoiceGrouping,
  patientGrouping: InvoiceGrouping | null
): InvoiceGrouping {
  return patientGrouping ?? clinicGrouping
}

export function isGroupingAllowed(
  billingMode: BillingMode,
  grouping: InvoiceGrouping
): boolean {
  if (grouping === "PER_SESSION" && billingMode === "MONTHLY_FIXED") return false
  return true
}

export function deriveGroupStatus(statuses: InvoiceStatus[]): InvoiceStatus {
  const nonCancelled = statuses.filter(s => s !== "CANCELADO")
  if (nonCancelled.length === 0) return "CANCELADO"

  const allSame = nonCancelled.every(s => s === nonCancelled[0])
  if (allSame) return nonCancelled[0]

  const hasPago = nonCancelled.includes("PAGO")
  const hasUnpaid = nonCancelled.some(s => s !== "PAGO")
  if (hasPago && hasUnpaid) return "PARCIAL"

  // Mixed PENDENTE/ENVIADO — return the "lowest" status
  if (nonCancelled.includes("PENDENTE")) return "PENDENTE"
  if (nonCancelled.includes("ENVIADO")) return "ENVIADO"
  return "PARCIAL"
}
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/financeiro/invoice-grouping.test.ts`
Expected: PASS

**Step 5: Add to barrel export**

In `src/lib/financeiro/index.ts`, add:
```typescript
export { resolveGrouping, isGroupingAllowed, deriveGroupStatus } from "./invoice-grouping"
```

**Step 6: Commit**

```bash
git add src/lib/financeiro/invoice-grouping.ts src/lib/financeiro/invoice-grouping.test.ts src/lib/financeiro/index.ts
git commit -m "feat: add invoice-grouping domain module with tests"
```

---

### Task 3: Extract Generation Strategy from gerar/route.ts

Refactor only — no new behavior. Extract the per-patient invoice generation logic into a reusable function.

**Files:**
- Create: `src/lib/financeiro/generate-monthly-invoice.ts`
- Modify: `src/app/api/financeiro/faturas/gerar/route.ts` (call extracted function)

**Step 1: Extract function**

Create `src/lib/financeiro/generate-monthly-invoice.ts` with a function that encapsulates the current per-patient logic from `gerar/route.ts` lines ~130-310. The function signature:

```typescript
export async function generateMonthlyInvoice(
  tx: PrismaTransactionClient,
  params: {
    clinicId: string
    patientId: string
    profId: string
    month: number
    year: number
    appointments: AppointmentForInvoice[]
    billingMode: string
    sessionFee: number
    clinicDueDay: number
    patientDueDay: number | null
    patientTemplate: string | null
    clinicTemplate: string | null
    clinicPaymentInfo: string | null
    profName: string
    patientName: string
    motherName: string | null
    fatherName: string | null
    showAppointmentDays: boolean
  }
): Promise<"generated" | "updated" | "skipped">
```

This function contains the existing logic:
- Find existing MONTHLY invoice
- Skip if PAGO/ENVIADO/PARCIAL
- Filter already-invoiced appointments
- Build items (PER_SESSION billing or MONTHLY_FIXED)
- Consume credits
- Create or update invoice
- Recalculate totals

**Step 2: Update gerar/route.ts**

Replace the inline logic with a call to `generateMonthlyInvoice()`. The route becomes a thin orchestrator: fetch data, loop patients, call strategy function, aggregate results.

**Step 3: Verify no behavior change**

Run: `npm run build`
Expected: PASS (no behavior change, just extraction)

**Step 4: Commit**

```bash
git add src/lib/financeiro/generate-monthly-invoice.ts src/app/api/financeiro/faturas/gerar/route.ts
git commit -m "refactor: extract monthly invoice generation into reusable function"
```

---

### Task 4: Per-Session Generation Strategy

**Files:**
- Create: `src/lib/financeiro/generate-per-session-invoices.ts`
- Create: `src/lib/financeiro/generate-per-session-invoices.test.ts`

**Step 1: Write tests for the pure helper functions**

Test the per-session item builder and credit allocation logic:
- 4 appointments → 4 invoice data objects, each with 1 item
- 1 credit + 4 appointments → 3 full-price + 1 zero-amount (credit applied to earliest)
- Already-invoiced appointments are excluded
- Due date = appointment scheduledAt date
- Invoice type = PER_SESSION

**Step 2: Implement**

```typescript
export async function generatePerSessionInvoices(
  tx: PrismaTransactionClient,
  params: {
    clinicId: string
    patientId: string
    profId: string
    month: number
    year: number
    appointments: AppointmentForInvoice[]
    sessionFee: number
    patientTemplate: string | null
    clinicTemplate: string | null
    clinicPaymentInfo: string | null
    profName: string
    patientName: string
    motherName: string | null
    fatherName: string | null
    showAppointmentDays: boolean
  }
): Promise<{ generated: number; updated: number; skipped: number }>
```

Logic:
1. Sort appointments by `scheduledAt` ASC
2. Get all appointment IDs already invoiced (any invoice type) — prevent double-billing
3. Filter to un-invoiced appointments only
4. Fetch unconsumed credits for patient
5. For each appointment:
   a. Check if PER_SESSION invoice already exists for this appointment (via InvoiceItem.appointmentId + Invoice.invoiceType = PER_SESSION)
   b. If exists and should skip → skip
   c. Build single InvoiceItem (classify type, set price)
   d. If credit available → add CREDITO item, consume credit, set totalAmount = 0
   e. Create invoice with `invoiceType: "PER_SESSION"`, `dueDate = appointment.scheduledAt`, `totalSessions = 1`
   f. Render message body
6. Return counts

**Step 3: Run tests**

Run: `npx vitest run src/lib/financeiro/generate-per-session-invoices.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/financeiro/generate-per-session-invoices.ts src/lib/financeiro/generate-per-session-invoices.test.ts
git commit -m "feat: add per-session invoice generation strategy"
```

---

### Task 5: Wire Up gerar/route.ts to Dispatch by Grouping

**Files:**
- Modify: `src/app/api/financeiro/faturas/gerar/route.ts`

**Step 1: Import and dispatch**

In the per-patient loop, after determining the patient:
1. Fetch clinic's `invoiceGrouping`
2. Fetch patient's `invoiceGrouping` override
3. Call `resolveGrouping(clinic, patient)`
4. If `PER_SESSION` → call `generatePerSessionInvoices()`
5. If `MONTHLY` → call `generateMonthlyInvoice()` (existing)
6. Aggregate results

**Step 2: Verify build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/financeiro/faturas/gerar/route.ts
git commit -m "feat: dispatch invoice generation by grouping mode"
```

---

### Task 6: Cancellation Flow — Per-Session Invoice Awareness

**Files:**
- Modify: `src/app/api/appointments/[id]/status/route.ts`
- Create: `src/lib/financeiro/per-session-cancellation.ts`
- Create: `src/lib/financeiro/per-session-cancellation.test.ts`

**Step 1: Create domain function**

```typescript
export async function handlePerSessionCancellation(
  tx: PrismaTransactionClient,
  appointmentId: string,
  clinicId: string
): Promise<"cancelled" | "credited" | "none">
```

Logic:
1. Find InvoiceItem where `appointmentId` matches, join Invoice where `invoiceType = "PER_SESSION"`
2. If no invoice found → return "none"
3. If invoice status is PENDENTE or ENVIADO → set invoice to CANCELADO, release credits → return "cancelled"
4. If invoice status is PAGO or PARCIAL → create SessionCredit → return "credited"

**Step 2: Write tests for the pure decision logic**

Test `shouldCancelPerSessionInvoice(status)` and `shouldCreateCreditForPerSession(status)`:
- PENDENTE → cancel
- ENVIADO → cancel
- PAGO → credit
- PARCIAL → credit
- CANCELADO → none (already cancelled)

**Step 3: Integrate into status/route.ts**

In the cancellation section (around line 220), after the existing credit logic, add:

```typescript
// For PER_SESSION invoices: cancel the invoice or create credit
const grouping = resolveGrouping(clinic.invoiceGrouping, patient.invoiceGrouping)
if (grouping === "PER_SESSION") {
  await handlePerSessionCancellation(tx, appointment.id, user.clinicId)
}
```

**Step 4: Run build and tests**

Run: `npm run build && npm run test`

**Step 5: Commit**

```bash
git add src/lib/financeiro/per-session-cancellation.ts src/lib/financeiro/per-session-cancellation.test.ts src/app/api/appointments/[id]/status/route.ts
git commit -m "feat: cancel per-session invoices on appointment cancellation"
```

---

### Task 7: Recalculation Route — Branch by InvoiceType

**Files:**
- Modify: `src/app/api/financeiro/faturas/[id]/recalcular/route.ts`

**Step 1: Add PER_SESSION branch**

After fetching the invoice, check `invoice.invoiceType`:

- If `"PER_SESSION"`:
  - Skip the "fetch all appointments for month" logic
  - Only recalculate the single linked InvoiceItem (update price from current sessionFee)
  - Preserve manual items
  - Recalculate totals and message body
- If `"MONTHLY"`: existing logic unchanged

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/app/api/financeiro/faturas/[id]/recalcular/route.ts
git commit -m "feat: branch recalculation by invoice type for per-session support"
```

---

### Task 8: Clinic Settings UI — InvoiceGrouping Dropdown

**Files:**
- Modify: `src/app/admin/settings/page.tsx`
- Modify: `src/app/api/admin/settings/route.ts` (accept new field)

**Step 1: Add UI**

After the billing mode radio buttons (line ~600), add "Agrupamento de Faturas" section:

```tsx
<div>
  <label>Agrupamento de Faturas</label>
  <select
    value={form.invoiceGrouping}
    onChange={e => setForm({ ...form, invoiceGrouping: e.target.value })}
    disabled={form.billingMode === "MONTHLY_FIXED"}
  >
    <option value="MONTHLY">Mensal (uma fatura por mês)</option>
    <option value="PER_SESSION">Por Sessão (uma fatura por sessão)</option>
  </select>
  {form.billingMode === "MONTHLY_FIXED" && (
    <p className="text-xs text-muted-foreground">
      Agrupamento por sessão requer cobrança por sessão
    </p>
  )}
</div>
```

**Step 2: Update API route**

Add `invoiceGrouping` to the settings update schema and Prisma update call.
When `billingMode` is changed to `MONTHLY_FIXED`, force `invoiceGrouping = "MONTHLY"` and null out patient-level PER_SESSION overrides:

```typescript
if (billingMode === "MONTHLY_FIXED") {
  await tx.patient.updateMany({
    where: { clinicId: user.clinicId, invoiceGrouping: "PER_SESSION" },
    data: { invoiceGrouping: null },
  })
}
```

**Step 3: Commit**

```bash
git add src/app/admin/settings/page.tsx src/app/api/admin/settings/route.ts
git commit -m "feat: add invoice grouping setting to clinic settings UI"
```

---

### Task 9: Patient Settings — InvoiceGrouping Override

**Files:**
- Modify: patient edit page/component (find the patient form that saves `invoiceDueDay`)
- Modify: patient API route (accept `invoiceGrouping` field)

**Step 1: Find patient settings UI**

Search for the patient form that includes `invoiceDueDay` and `invoiceMessageTemplate` fields.

**Step 2: Add dropdown**

Below `invoiceDueDay`, add:

```tsx
<div>
  <label>Agrupamento de Faturas</label>
  <select value={form.invoiceGrouping ?? ""} onChange={...}>
    <option value="">Padrão da clínica</option>
    <option value="MONTHLY">Mensal</option>
    <option value="PER_SESSION">Por Sessão</option>
  </select>
</div>
```

Disable `PER_SESSION` option if clinic `billingMode === "MONTHLY_FIXED"`.

**Step 3: Update patient API**

Add `invoiceGrouping` to the patient update schema. Validate with `isGroupingAllowed()`.

**Step 4: Commit**

```bash
git add [patient form files] [patient API route]
git commit -m "feat: add per-patient invoice grouping override"
```

---

### Task 10: Invoice List UI — Collapsible Groups

**Files:**
- Modify: `src/app/financeiro/faturas/page.tsx`
- Create: `src/app/financeiro/faturas/components/InvoiceGroup.tsx` (if needed)

**Step 1: Group per-session invoices**

In the invoice list, after fetching invoices:
1. Separate MONTHLY/MANUAL invoices from PER_SESSION invoices
2. Group PER_SESSION invoices by `patientId + referenceMonth + referenceYear`
3. For each group, compute: total amount, session count, derived status via `deriveGroupStatus()`
4. Render as collapsible rows:
   - Header: patient name, total, derived status, session count, expand/collapse toggle
   - Expanded: individual session invoice rows (date, amount, status, actions)
5. MONTHLY/MANUAL invoices render as normal rows (no grouping)

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/app/financeiro/faturas/page.tsx [component files]
git commit -m "feat: collapsible per-session invoice groups in invoice list"
```

---

### Task 11: Bank Reconciliation — Group Same-Patient Per-Session Invoices

**Files:**
- Modify: `src/lib/bank-reconciliation/matcher.ts`
- Modify: `src/lib/bank-reconciliation/matcher.test.ts`

**Step 1: Extend findGroupCandidates**

Currently groups pairs of sibling invoices. Add a new function or extend to also find groups of per-session invoices from the same patient that sum to the transaction amount.

```typescript
export function findPerSessionGroups(
  txAmount: number,
  invoices: InvoiceWithParent[]
): Array<{ invoices: InvoiceWithParent[]; sharedParent: string | null }>
```

Logic:
- Group invoices by patientId
- For each patient group, check if the sum of remaining amounts equals txAmount (within 0.01 tolerance)
- If match, return as a group candidate

**Step 2: Write tests**

Test: 4 invoices of R$200 for same patient, transaction of R$800 → group match.
Test: 3 of 4 invoices sum to R$600, transaction R$600 → subset match (if supported) or skip.

**Step 3: Integrate into matchTransactions**

Add per-session groups alongside existing sibling groups.

**Step 4: Commit**

```bash
git add src/lib/bank-reconciliation/matcher.ts src/lib/bank-reconciliation/matcher.test.ts
git commit -m "feat: match bank transactions to grouped per-session invoices"
```

---

### Task 12: ZIP Filename Fix + Dashboard Awareness

**Files:**
- Modify: `src/app/api/financeiro/faturas/download-zip/route.ts`
- Modify: `src/app/api/financeiro/dashboard/route.ts` (if separate dashboard exists)

**Step 1: Fix ZIP filenames**

Change filename generation for PER_SESSION invoices:
```typescript
const dateStr = invoice.invoiceType === "PER_SESSION" && invoice.items[0]?.appointment
  ? `-${formatDateBR(invoice.items[0].appointment.scheduledAt)}`
  : ""
const filename = `${mm}-${prof}-${patient}${dateStr}.pdf`
```

**Step 2: Dashboard awareness (if needed)**

If the dashboard route aggregates invoice counts, consider grouping per-session invoices by patient+month for the "patients billed" metric.

**Step 3: Commit**

```bash
git add src/app/api/financeiro/faturas/download-zip/route.ts [dashboard files]
git commit -m "fix: unique ZIP filenames for per-session invoices"
```

---

### Task 13: Build Verification & Manual Testing

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual test checklist**

1. Set clinic to PER_SESSION grouping in settings
2. Run "Gerar Faturas" for current month → verify N invoices created (one per session)
3. Check invoice list → verify collapsible groups
4. Check individual per-session invoice → verify single item, dueDate = session date
5. Cancel an appointment → verify per-session invoice auto-cancelled
6. Set one patient to MONTHLY override → verify that patient gets monthly invoice
7. Switch clinic to MONTHLY_FIXED → verify PER_SESSION grouping disabled and patient overrides cleared
8. Bank reconciliation → verify grouped matching works

**Step 4: Commit any fixes**

---

### Task 14: Cleanup and Final Commit

**Step 1: Run linter**

Run: `npm run lint`
Fix any issues.

**Step 2: Final build + test**

Run: `npm run build && npm run test`

**Step 3: Commit**

```bash
git commit -m "chore: cleanup and final adjustments for per-session invoicing"
```
