# Usual Payers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add learned "usual payers" per patient so that company/third-party payers automatically get KNOWN (highest) confidence in bank reconciliation matching.

**Architecture:** New `PatientUsualPayer` table stores normalized payer names per patient. On reconciliation confirmation, payer names are auto-saved. The matcher checks usual payers first, assigning KNOWN confidence (above HIGH). No new UI controls — only a new badge color for KNOWN.

**Tech Stack:** Prisma (migration), TypeScript, Vitest, Next.js API routes

**Spec:** `docs/superpowers/specs/2026-03-11-usual-payers-design.md`

---

## Chunk 1: Data Model + Matcher Logic

### Task 1: Prisma Schema — Add PatientUsualPayer Model

**Files:**
- Modify: `prisma/schema.prisma` (add model after line 401, add relations to Patient ~line 371 and Clinic ~line 213)

- [ ] **Step 1: Add the PatientUsualPayer model to schema.prisma**

After the `PatientPhone` model (line 401), add:

```prisma
/// Learned payer names for bank reconciliation auto-matching
model PatientUsualPayer {
  id        String   @id @default(cuid())
  patientId String
  clinicId  String
  payerName String   // Normalized (lowercase, no accents, collapsed whitespace)
  createdAt DateTime @default(now())

  patient Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)
  clinic  Clinic  @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@unique([patientId, payerName])
  @@index([clinicId, payerName])
}
```

Add relation to `Patient` model (after `sessionCredits` relation, ~line 372):
```prisma
  usualPayers            PatientUsualPayer[]
```

Add relation to `Clinic` model (after `reconciliationLinks` relation, ~line 213):
```prisma
  patientUsualPayers     PatientUsualPayer[]
```

- [ ] **Step 2: Create migration**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx prisma migrate dev --name add-patient-usual-payer
```
Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 3: Verify migration applied**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx prisma migrate status
```
Expected: All migrations applied, no pending migrations.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcus/personal/clinica-usual-payers && git add prisma/schema.prisma prisma/migrations/ && git commit -m "feat: add PatientUsualPayer model for learned payer names"
```

---

### Task 2: Add KNOWN to MatchConfidence Type

**Files:**
- Modify: `src/lib/bank-reconciliation/types.ts:22`

- [ ] **Step 1: Update MatchConfidence type**

In `src/lib/bank-reconciliation/types.ts`, change line 22 from:
```typescript
export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW"
```
to:
```typescript
export type MatchConfidence = "KNOWN" | "HIGH" | "MEDIUM" | "LOW"
```

- [ ] **Step 2: Update comments on nameScore and matchedField**

In `src/lib/bank-reconciliation/types.ts`, change line 27 from:
```typescript
  nameScore: number // 0-1 similarity
```
to:
```typescript
  nameScore: number // 0-2 (2.0 for KNOWN, 0-1 for name similarity)
```

Change line 28 from:
```typescript
  matchedField: string | null // "motherName", "fatherName", "patientName", or null
```
to:
```typescript
  matchedField: string | null // "usualPayer", "motherName", "fatherName", "patientName", "patientSurname", or null
```

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx vitest run src/lib/bank-reconciliation/matcher.test.ts
```
Expected: All existing tests PASS (adding KNOWN to a union type is backward-compatible).

- [ ] **Step 4: Commit**

```bash
cd /Users/marcus/personal/clinica-usual-payers && git add src/lib/bank-reconciliation/types.ts && git commit -m "feat: add KNOWN confidence level to MatchConfidence type"
```

---

### Task 3: Matcher — Add Usual Payer Lookup (TDD)

**Files:**
- Modify: `src/lib/bank-reconciliation/matcher.ts:214-305`
- Modify: `src/lib/bank-reconciliation/matcher.test.ts`

- [ ] **Step 1: Write failing tests for KNOWN confidence**

Add to the end of `src/lib/bank-reconciliation/matcher.test.ts`, before the `findGroupCandidates` describe block (before line 299):

```typescript
describe("matchTransactions with usual payers", () => {
  it("assigns KNOWN confidence when payer matches a patient's usual payer", () => {
    const transactions = [makeTransaction({ payerName: "EMPRESA XYZ LTDA" })]
    const invoices = [makeInvoice({ id: "inv1", patientId: "p1" })]
    // Map: normalized "empresa xyz ltda" → Set(["p1"])
    const usualPayersMap = new Map([["empresa xyz ltda", new Set(["p1"])]])
    const results = matchTransactions(transactions, invoices, usualPayersMap)
    expect(results[0].candidates).toHaveLength(1)
    expect(results[0].candidates[0].confidence).toBe("KNOWN")
    expect(results[0].candidates[0].nameScore).toBe(2)
    expect(results[0].candidates[0].matchedField).toBe("usualPayer")
  })

  it("KNOWN sorts above HIGH", () => {
    const transactions = [makeTransaction({ payerName: "EMPRESA XYZ LTDA", amount: 500 })]
    const invoices = [
      makeInvoice({ id: "inv1", patientId: "p1", motherName: "Empresa Xyz Ltda" }),
      makeInvoice({ id: "inv2", patientId: "p2", patientName: "Ana", motherName: "Julia" }),
    ]
    const usualPayersMap = new Map([["empresa xyz ltda", new Set(["p2"])]])
    const results = matchTransactions(transactions, invoices, usualPayersMap)
    expect(results[0].candidates[0].invoice.id).toBe("inv2") // KNOWN
    expect(results[0].candidates[0].confidence).toBe("KNOWN")
    expect(results[0].candidates[1].invoice.id).toBe("inv1") // HIGH (name match)
  })

  it("does not assign KNOWN when payer matches but patient does not", () => {
    const transactions = [makeTransaction({ payerName: "EMPRESA XYZ LTDA" })]
    const invoices = [makeInvoice({ id: "inv1", patientId: "p1" })]
    // Map has the payer but for a different patient
    const usualPayersMap = new Map([["empresa xyz ltda", new Set(["p999"])]])
    const results = matchTransactions(transactions, invoices, usualPayersMap)
    expect(results[0].candidates[0].confidence).not.toBe("KNOWN")
  })

  it("normalizes payer name before lookup", () => {
    const transactions = [makeTransaction({ payerName: "Émpresa  XYZ  Ltda" })]
    const invoices = [makeInvoice({ id: "inv1", patientId: "p1" })]
    const usualPayersMap = new Map([["empresa xyz ltda", new Set(["p1"])]])
    const results = matchTransactions(transactions, invoices, usualPayersMap)
    expect(results[0].candidates[0].confidence).toBe("KNOWN")
  })

  it("works without usualPayersMap (backward compatible)", () => {
    const transactions = [makeTransaction()]
    const invoices = [makeInvoice()]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(1)
    // Should still work as before — HIGH from name match
    expect(results[0].candidates[0].confidence).toBe("HIGH")
  })

  it("handles multiple patients with same usual payer", () => {
    const transactions = [makeTransaction({ payerName: "EMPRESA XYZ", amount: 500 })]
    const invoices = [
      makeInvoice({ id: "inv1", patientId: "p1" }),
      makeInvoice({ id: "inv2", patientId: "p2" }),
    ]
    const usualPayersMap = new Map([["empresa xyz", new Set(["p1", "p2"])]])
    const results = matchTransactions(transactions, invoices, usualPayersMap)
    expect(results[0].candidates).toHaveLength(2)
    expect(results[0].candidates.every(c => c.confidence === "KNOWN")).toBe(true)
  })

  it("skips KNOWN check when transaction payerName is null", () => {
    const transactions = [makeTransaction({ payerName: null })]
    const invoices = [makeInvoice()]
    const usualPayersMap = new Map([["something", new Set(["p1"])]])
    const results = matchTransactions(transactions, invoices, usualPayersMap)
    expect(results[0].candidates[0].confidence).toBe("LOW")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx vitest run src/lib/bank-reconciliation/matcher.test.ts
```
Expected: FAIL — `matchTransactions` doesn't accept a third argument yet, and KNOWN logic doesn't exist.

- [ ] **Step 3: Implement usual payer lookup in matcher.ts**

In `src/lib/bank-reconciliation/matcher.ts`, make three surgical changes (do NOT replace existing logic — only insert new code and update the signature/sort):

**a)** Update the `matchTransactions` signature (lines 214-216) to accept an optional third parameter:

Change:
```typescript
export function matchTransactions(
  transactions: TransactionForMatching[],
  invoices: InvoiceForMatching[]
): MatchResult[] {
```
To:
```typescript
export function matchTransactions(
  transactions: TransactionForMatching[],
  invoices: InvoiceForMatching[],
  usualPayersMap?: Map<string, Set<string>>
): MatchResult[] {
```

**b)** Insert the KNOWN check at the top of the `candidates.map` callback. After `const candidates: MatchCandidate[] = amountMatches.map(invoice => {` (line 225), insert BEFORE the existing `if (!transaction.payerName)` check:

```typescript
      // Check usual payers first (highest priority)
      if (transaction.payerName && usualPayersMap) {
        const normalizedPayer = normalizeForComparison(transaction.payerName)
        const patientIds = usualPayersMap.get(normalizedPayer)
        if (patientIds?.has(invoice.patientId)) {
          return {
            invoice,
            confidence: "KNOWN" as MatchConfidence,
            nameScore: 2,
            matchedField: "usualPayer",
          }
        }
      }
```

All existing code below (null-payerName check, name similarity, surname matching, etc.) remains unchanged.

**c)** Update the sort order map (line 296) from:

```typescript
    const order: Record<MatchConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
```
To:
```typescript
    const order: Record<MatchConfidence, number> = { KNOWN: -1, HIGH: 0, MEDIUM: 1, LOW: 2 }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx vitest run src/lib/bank-reconciliation/matcher.test.ts
```
Expected: ALL tests PASS (both new and existing).

- [ ] **Step 5: Commit**

```bash
cd /Users/marcus/personal/clinica-usual-payers && git add src/lib/bank-reconciliation/matcher.ts src/lib/bank-reconciliation/matcher.test.ts && git commit -m "feat: add KNOWN confidence matching via usual payers map"
```

---

## Chunk 2: API Routes + UI Types

### Task 4: Reconcile Route — Auto-Save Usual Payers on Confirmation

**Files:**
- Modify: `src/app/api/financeiro/conciliacao/reconcile/route.ts:84-155`

- [ ] **Step 1: Add import for normalizeForComparison**

In `src/app/api/financeiro/conciliacao/reconcile/route.ts`, change line 5 from:
```typescript
import { computeInvoiceStatus } from "@/lib/bank-reconciliation"
```
to:
```typescript
import { computeInvoiceStatus, normalizeForComparison } from "@/lib/bank-reconciliation"
```

- [ ] **Step 2: Add usual payer upserts inside the transaction block**

After the invoice status recalculation loop (after line 154, before the closing `}, { timeout: TX_TIMEOUT })`), add:

```typescript
        // Auto-save usual payers for future matching
        const seenPayers = new Set<string>()
        for (const link of links) {
          const bankTx = txMap.get(link.transactionId)!
          if (!bankTx.payerName) continue
          const invoice = invoiceMap.get(link.invoiceId)!
          if (!invoice.patientId) continue

          const normalizedPayer = normalizeForComparison(bankTx.payerName)
          if (!normalizedPayer) continue

          const key = `${invoice.patientId}:${normalizedPayer}`
          if (seenPayers.has(key)) continue
          seenPayers.add(key)

          await tx.patientUsualPayer.upsert({
            where: {
              patientId_payerName: {
                patientId: invoice.patientId,
                payerName: normalizedPayer,
              },
            },
            create: {
              clinicId: user.clinicId,
              patientId: invoice.patientId,
              payerName: normalizedPayer,
            },
            update: {}, // No-op if already exists
          })
        }
```

- [ ] **Step 3: Verify build compiles**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: No errors related to the reconcile route changes.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcus/personal/clinica-usual-payers && git add src/app/api/financeiro/conciliacao/reconcile/route.ts && git commit -m "feat: auto-save usual payers on reconciliation confirmation"
```

---

### Task 5: Transactions Route — Load Usual Payers and Pass to Matcher

**Files:**
- Modify: `src/app/api/financeiro/conciliacao/transactions/route.ts:34-126`

- [ ] **Step 1: Load usual payers alongside existing queries**

In `src/app/api/financeiro/conciliacao/transactions/route.ts`, change the parallel query block (lines 34-82) from:
```typescript
    const [transactions, invoices] = await Promise.all([
```
to:
```typescript
    const [transactions, invoices, usualPayers] = await Promise.all([
```

And after the `invoices` query closing paren (after line 81, before `])`), add:

```typescript
      prisma.patientUsualPayer.findMany({
        where: { clinicId: user.clinicId },
        select: { payerName: true, patientId: true },
      }),
```

- [ ] **Step 2: Build the usualPayersMap**

After the `invWithParent` computation (after line 124), add:

```typescript
    // Build usual payers lookup: normalizedPayerName → Set<patientId>
    const usualPayersMap = new Map<string, Set<string>>()
    for (const up of usualPayers) {
      const existing = usualPayersMap.get(up.payerName)
      if (existing) {
        existing.add(up.patientId)
      } else {
        usualPayersMap.set(up.payerName, new Set([up.patientId]))
      }
    }
```

- [ ] **Step 3: Pass usualPayersMap to matchTransactions**

Find the `matchTransactions` call (originally line 126, now shifted down after Step 2 insertions) and change:
```typescript
    const matchResults = matchTransactions(txForMatching, invForMatching)
```
to:
```typescript
    const matchResults = matchTransactions(txForMatching, invForMatching, usualPayersMap)
```

- [ ] **Step 4: Verify build compiles**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcus/personal/clinica-usual-payers && git add src/app/api/financeiro/conciliacao/transactions/route.ts && git commit -m "feat: load usual payers and pass to matcher for KNOWN matching"
```

---

### Task 6: Frontend Types + ConfidenceBadge — Add KNOWN

**Files:**
- Modify: `src/app/financeiro/conciliacao/components/types.ts:22-82`
- Modify: `src/app/financeiro/conciliacao/components/shared-ui.tsx:27-35`

- [ ] **Step 1: Update Candidate confidence type**

In `src/app/financeiro/conciliacao/components/types.ts`, change line 23 from:
```typescript
  confidence: "HIGH" | "MEDIUM" | "LOW"
```
to:
```typescript
  confidence: "KNOWN" | "HIGH" | "MEDIUM" | "LOW"
```

- [ ] **Step 2: Add KNOWN to CONFIDENCE_CONFIG**

In `src/app/financeiro/conciliacao/components/types.ts`, change the `CONFIDENCE_CONFIG` (lines 66-82) to add KNOWN as the first entry:

```typescript
export const CONFIDENCE_CONFIG: Record<string, { bg: string; dot: string; label: string }> = {
  KNOWN: {
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
    dot: "bg-blue-500",
    label: "Pagador usual",
  },
  HIGH: {
    bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
    dot: "bg-green-500",
    label: "Alta",
  },
  MEDIUM: {
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
    dot: "bg-amber-500",
    label: "Média",
  },
  LOW: {
    bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
    dot: "bg-red-400",
    label: "Baixa",
  },
}
```

- [ ] **Step 3: Verify the ConfidenceBadge component needs no changes**

The `ConfidenceBadge` in `shared-ui.tsx` (line 27-35) already uses `CONFIDENCE_CONFIG[confidence]` dynamically — it will pick up KNOWN automatically. No changes needed to this component.

- [ ] **Step 4: Run full test suite**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npx vitest run
```
Expected: ALL tests PASS.

- [ ] **Step 5: Run build to verify no TypeScript errors**

Run:
```bash
cd /Users/marcus/personal/clinica-usual-payers && npm run build
```
Expected: Build succeeds (tests pass, no TS errors).

- [ ] **Step 6: Commit**

```bash
cd /Users/marcus/personal/clinica-usual-payers && git add src/app/financeiro/conciliacao/components/types.ts && git commit -m "feat: add KNOWN confidence level to frontend types and badge config"
```
