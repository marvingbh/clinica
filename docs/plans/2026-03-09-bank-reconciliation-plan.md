# Bank Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Manual bank reconciliation with Inter API — admin fetches transactions, reviews matches against invoices, confirms to mark as paid.

**Architecture:** Domain logic in `src/lib/bank-reconciliation/` (encryption, Inter API client, matching algorithm). API routes under `src/app/api/financeiro/conciliacao/`. UI page at `/financeiro/conciliacao`. New Prisma models `BankIntegration` and `BankTransaction`. TDD for all domain logic.

**Tech Stack:** Next.js API routes, Prisma, Node.js `crypto` (AES-256-GCM), `https` with mTLS for Inter API, Vitest for tests.

---

### Task 1: Prisma Schema — New models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add enum and models to schema**

Add after the `InvoiceType` enum (line ~115):

```prisma
enum BankProvider {
  INTER
}
```

Add after the `SessionCredit` model (end of file):

```prisma
// ============================================================================
// BANK RECONCILIATION MODELS
// ============================================================================

/// Bank API integration configuration (one per clinic per provider)
model BankIntegration {
  id            String       @id @default(cuid())
  clinicId      String
  provider      BankProvider @default(INTER)
  clientId      String
  clientSecret  String       // Encrypted
  certificate   String       @db.Text // PEM content, encrypted
  privateKey    String       @db.Text // PEM content, encrypted
  accountNumber String?
  isActive      Boolean      @default(true)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  clinic       Clinic            @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  transactions BankTransaction[]

  @@unique([clinicId, provider])
  @@index([clinicId])
}

/// Bank transaction fetched from bank API
model BankTransaction {
  id                  String    @id @default(cuid())
  clinicId            String
  bankIntegrationId   String
  externalId          String    // Bank's unique transaction identifier
  date                DateTime  @db.Date
  amount              Decimal   @db.Decimal(10, 2)
  description         String
  payerName           String?
  type                String    // CREDIT or DEBIT
  reconciledInvoiceId String?
  reconciledAt        DateTime?
  reconciledByUserId  String?
  createdAt           DateTime  @default(now())

  clinic          Clinic           @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  bankIntegration BankIntegration  @relation(fields: [bankIntegrationId], references: [id], onDelete: Cascade)
  reconciledInvoice Invoice?       @relation(fields: [reconciledInvoiceId], references: [id], onDelete: SetNull)
  reconciledByUser  User?          @relation(fields: [reconciledByUserId], references: [id], onDelete: SetNull)

  @@unique([clinicId, externalId])
  @@index([clinicId])
  @@index([bankIntegrationId])
  @@index([reconciledInvoiceId])
  @@index([clinicId, date])
}
```

Add relations to existing models:

In `Clinic` model, add:
```prisma
  bankIntegrations   BankIntegration[]
  bankTransactions   BankTransaction[]
```

In `Invoice` model, add:
```prisma
  bankTransactions   BankTransaction[]
```

In `User` model, add:
```prisma
  reconciledTransactions BankTransaction[]
```

**Step 2: Push schema to dev database**

Run: `npx prisma db push`
Expected: Schema pushed successfully, Prisma client regenerated.

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(bank-reconciliation): add BankIntegration and BankTransaction models"
```

---

### Task 2: Encryption module (TDD)

**Files:**
- Create: `src/lib/bank-reconciliation/encryption.ts`
- Create: `src/lib/bank-reconciliation/encryption.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/bank-reconciliation/encryption.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("encryption", () => {
  const TEST_KEY = "a".repeat(64) // 32 bytes hex

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("encrypts and decrypts a string roundtrip", async () => {
    const { encrypt, decrypt } = await import("./encryption")
    const plaintext = "my-secret-value"
    const encrypted = encrypt(plaintext)
    expect(encrypted).not.toBe(plaintext)
    expect(encrypted).toContain(":") // iv:authTag:ciphertext format
    const decrypted = decrypt(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it("produces different ciphertext for same input (random IV)", async () => {
    const { encrypt } = await import("./encryption")
    const a = encrypt("same")
    const b = encrypt("same")
    expect(a).not.toBe(b)
  })

  it("throws on tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("./encryption")
    const encrypted = encrypt("secret")
    const parts = encrypted.split(":")
    parts[2] = "ff" + parts[2].slice(2) // tamper ciphertext
    expect(() => decrypt(parts.join(":"))).toThrow()
  })

  it("encrypts multiline PEM content", async () => {
    const { encrypt, decrypt } = await import("./encryption")
    const pem = "-----BEGIN CERTIFICATE-----\nMIIBxx...\n-----END CERTIFICATE-----"
    const encrypted = encrypt(pem)
    expect(decrypt(encrypted)).toBe(pem)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bank-reconciliation/encryption.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```typescript
// src/lib/bank-reconciliation/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
  }
  return Buffer.from(hex, "hex")
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bank-reconciliation/encryption.test.ts`
Expected: 4 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/bank-reconciliation/encryption.ts src/lib/bank-reconciliation/encryption.test.ts
git commit -m "feat(bank-reconciliation): add AES-256-GCM encryption module with tests"
```

---

### Task 3: Matcher module (TDD)

**Files:**
- Create: `src/lib/bank-reconciliation/types.ts`
- Create: `src/lib/bank-reconciliation/matcher.ts`
- Create: `src/lib/bank-reconciliation/matcher.test.ts`

**Step 1: Create types**

```typescript
// src/lib/bank-reconciliation/types.ts
export interface TransactionForMatching {
  id: string
  date: Date
  amount: number // positive number
  description: string
  payerName: string | null
}

export interface InvoiceForMatching {
  id: string
  patientId: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  status: string // PENDENTE or ENVIADO
}

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW"

export interface MatchCandidate {
  invoice: InvoiceForMatching
  confidence: MatchConfidence
  nameScore: number // 0-1 similarity
  matchedField: string | null // "motherName", "fatherName", "patientName", or null
}

export interface MatchResult {
  transaction: TransactionForMatching
  candidates: MatchCandidate[] // sorted by confidence desc, nameScore desc
}
```

**Step 2: Write the failing tests**

```typescript
// src/lib/bank-reconciliation/matcher.test.ts
import { describe, it, expect } from "vitest"
import { matchTransactions, normalizeForComparison, nameSimilarity } from "./matcher"
import { TransactionForMatching, InvoiceForMatching } from "./types"

const makeTransaction = (overrides: Partial<TransactionForMatching> = {}): TransactionForMatching => ({
  id: "tx1",
  date: new Date("2026-03-05"),
  amount: 500,
  description: "PIX recebido",
  payerName: "Maria Silva",
  ...overrides,
})

const makeInvoice = (overrides: Partial<InvoiceForMatching> = {}): InvoiceForMatching => ({
  id: "inv1",
  patientId: "p1",
  patientName: "João Silva",
  motherName: "Maria Silva",
  fatherName: "Carlos Silva",
  totalAmount: 500,
  referenceMonth: 3,
  referenceYear: 2026,
  status: "PENDENTE",
  ...overrides,
})

describe("normalizeForComparison", () => {
  it("lowercases and removes accents", () => {
    expect(normalizeForComparison("María José")).toBe("maria jose")
  })

  it("trims whitespace", () => {
    expect(normalizeForComparison("  Ana  Maria  ")).toBe("ana maria")
  })

  it("handles null/undefined", () => {
    expect(normalizeForComparison(null)).toBe("")
    expect(normalizeForComparison(undefined)).toBe("")
  })
})

describe("nameSimilarity", () => {
  it("returns 1 for exact match", () => {
    expect(nameSimilarity("Maria Silva", "Maria Silva")).toBe(1)
  })

  it("returns 1 for case/accent-insensitive match", () => {
    expect(nameSimilarity("MARIA SILVA", "maria silva")).toBe(1)
    expect(nameSimilarity("María", "Maria")).toBe(1)
  })

  it("returns high score for substring match", () => {
    const score = nameSimilarity("Maria Silva Santos", "Maria Silva")
    expect(score).toBeGreaterThan(0.7)
  })

  it("returns 0 for completely different names", () => {
    expect(nameSimilarity("Ana Paula", "Carlos Eduardo")).toBe(0)
  })

  it("handles empty strings", () => {
    expect(nameSimilarity("", "Maria")).toBe(0)
    expect(nameSimilarity("Maria", "")).toBe(0)
  })
})

describe("matchTransactions", () => {
  it("matches transaction to invoice by exact amount", () => {
    const transactions = [makeTransaction()]
    const invoices = [makeInvoice()]
    const results = matchTransactions(transactions, invoices)
    expect(results).toHaveLength(1)
    expect(results[0].candidates).toHaveLength(1)
    expect(results[0].candidates[0].invoice.id).toBe("inv1")
  })

  it("returns no candidates when amount doesn't match", () => {
    const transactions = [makeTransaction({ amount: 999 })]
    const invoices = [makeInvoice()]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(0)
  })

  it("ranks by name similarity — motherName match is HIGH confidence", () => {
    const transactions = [makeTransaction({ payerName: "Maria Silva" })]
    const invoices = [makeInvoice({ motherName: "Maria Silva" })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("HIGH")
    expect(results[0].candidates[0].matchedField).toBe("motherName")
  })

  it("ranks by name similarity — fatherName match is HIGH confidence", () => {
    const transactions = [makeTransaction({ payerName: "Carlos Silva" })]
    const invoices = [makeInvoice({ fatherName: "Carlos Silva" })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("HIGH")
    expect(results[0].candidates[0].matchedField).toBe("fatherName")
  })

  it("gives MEDIUM confidence for partial name match", () => {
    const transactions = [makeTransaction({ payerName: "Maria Silva Santos" })]
    const invoices = [makeInvoice({ motherName: "Maria Silva" })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("MEDIUM")
  })

  it("gives LOW confidence when no name matches", () => {
    const transactions = [makeTransaction({ payerName: "Unknown Person" })]
    const invoices = [makeInvoice()]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("LOW")
  })

  it("gives LOW confidence when payerName is null", () => {
    const transactions = [makeTransaction({ payerName: null })]
    const invoices = [makeInvoice()]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("LOW")
  })

  it("ranks multiple candidates by confidence then name score", () => {
    const transactions = [makeTransaction({ payerName: "Maria Silva", amount: 500 })]
    const invoices = [
      makeInvoice({ id: "inv1", motherName: "Maria Silva", patientName: "João" }),
      makeInvoice({ id: "inv2", patientId: "p2", motherName: "Ana Paula", patientName: "Pedro", fatherName: "Roberto" }),
    ]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(2)
    expect(results[0].candidates[0].invoice.id).toBe("inv1") // HIGH — exact motherName
    expect(results[0].candidates[1].invoice.id).toBe("inv2") // LOW — no name match
  })

  it("only matches invoices with PENDENTE or ENVIADO status", () => {
    const transactions = [makeTransaction()]
    const invoices = [
      makeInvoice({ id: "inv1", status: "PAGO" }),
      makeInvoice({ id: "inv2", status: "PENDENTE" }),
    ]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(1)
    expect(results[0].candidates[0].invoice.id).toBe("inv2")
  })

  it("handles multiple transactions", () => {
    const transactions = [
      makeTransaction({ id: "tx1", amount: 500 }),
      makeTransaction({ id: "tx2", amount: 300 }),
    ]
    const invoices = [
      makeInvoice({ id: "inv1", totalAmount: 500 }),
      makeInvoice({ id: "inv2", patientId: "p2", totalAmount: 300 }),
    ]
    const results = matchTransactions(transactions, invoices)
    expect(results).toHaveLength(2)
    expect(results[0].candidates[0].invoice.id).toBe("inv1")
    expect(results[1].candidates[0].invoice.id).toBe("inv2")
  })

  it("returns empty candidates for transaction with no matching invoices", () => {
    const transactions = [makeTransaction({ amount: 777 })]
    const invoices = [makeInvoice({ totalAmount: 500 })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(0)
  })
})
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/bank-reconciliation/matcher.test.ts`
Expected: FAIL — modules not found.

**Step 4: Write implementation**

```typescript
// src/lib/bank-reconciliation/matcher.ts
import { TransactionForMatching, InvoiceForMatching, MatchResult, MatchCandidate, MatchConfidence } from "./types"

const VALID_STATUSES = ["PENDENTE", "ENVIADO"]

/**
 * Normalize a string for comparison: lowercase, remove accents, collapse whitespace.
 */
export function normalizeForComparison(str: string | null | undefined): string {
  if (!str) return ""
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Calculate name similarity between two strings.
 * Returns 0-1 where 1 is exact match.
 * Uses word overlap / containment approach.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeForComparison(a)
  const nb = normalizeForComparison(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const wordsA = na.split(" ")
  const wordsB = nb.split(" ")
  const matchingWords = wordsA.filter(w => wordsB.includes(w))

  if (matchingWords.length === 0) return 0

  // Score based on proportion of matching words relative to the shorter name
  const maxWords = Math.max(wordsA.length, wordsB.length)
  return matchingWords.length / maxWords
}

function getConfidence(nameScore: number): MatchConfidence {
  if (nameScore >= 1) return "HIGH"
  if (nameScore >= 0.5) return "MEDIUM"
  return "LOW"
}

/**
 * Match transactions to invoices.
 * For each transaction, find invoices with matching amount,
 * then rank by name similarity (payerName vs motherName/fatherName/patientName).
 */
export function matchTransactions(
  transactions: TransactionForMatching[],
  invoices: InvoiceForMatching[]
): MatchResult[] {
  const eligibleInvoices = invoices.filter(inv => VALID_STATUSES.includes(inv.status))

  return transactions.map(transaction => {
    const amountMatches = eligibleInvoices.filter(
      inv => Math.abs(inv.totalAmount - transaction.amount) < 0.01
    )

    const candidates: MatchCandidate[] = amountMatches.map(invoice => {
      if (!transaction.payerName) {
        return { invoice, confidence: "LOW" as MatchConfidence, nameScore: 0, matchedField: null }
      }

      // Compare against motherName, fatherName, patientName
      const scores = [
        { field: "motherName", score: nameSimilarity(transaction.payerName, invoice.motherName) },
        { field: "fatherName", score: nameSimilarity(transaction.payerName, invoice.fatherName) },
        { field: "patientName", score: nameSimilarity(transaction.payerName, invoice.patientName) },
      ]

      const best = scores.reduce((a, b) => (b.score > a.score ? b : a))
      const confidence = getConfidence(best.score)

      return {
        invoice,
        confidence,
        nameScore: best.score,
        matchedField: best.score > 0 ? best.field : null,
      }
    })

    // Sort: HIGH first, then MEDIUM, then LOW; within same confidence, by nameScore desc
    const order: Record<MatchConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    candidates.sort((a, b) => {
      const diff = order[a.confidence] - order[b.confidence]
      if (diff !== 0) return diff
      return b.nameScore - a.nameScore
    })

    return { transaction, candidates }
  })
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/bank-reconciliation/matcher.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add src/lib/bank-reconciliation/types.ts src/lib/bank-reconciliation/matcher.ts src/lib/bank-reconciliation/matcher.test.ts
git commit -m "feat(bank-reconciliation): add transaction-to-invoice matcher with TDD tests"
```

---

### Task 4: Inter API client

**Files:**
- Create: `src/lib/bank-reconciliation/inter-client.ts`

This module handles OAuth2 token acquisition with mTLS and statement fetching. Not unit-tested (external API dependency) — will be integration-tested manually.

**Step 1: Write implementation**

```typescript
// src/lib/bank-reconciliation/inter-client.ts
import https from "https"
import { decrypt } from "./encryption"

interface InterTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface InterTransaction {
  idTransacao: string
  dataEntradaContaBancaria: string
  dataLancamento: string
  tipoTransacao: string
  tipoOperacao: string
  valor: string
  titulo: string
  descricao: string
}

interface InterStatementResponse {
  transacoes: InterTransaction[]
}

export interface InterConfig {
  clientId: string
  clientSecret: string // encrypted
  certificate: string  // encrypted PEM
  privateKey: string   // encrypted PEM
}

function createAgent(config: InterConfig): https.Agent {
  const cert = decrypt(config.certificate)
  const key = decrypt(config.privateKey)
  return new https.Agent({ cert, key })
}

async function getAccessToken(config: InterConfig): Promise<string> {
  const agent = createAgent(config)
  const clientSecret = decrypt(config.clientSecret)

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    scope: "extrato.read",
    grant_type: "client_credentials",
  }).toString()

  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
      {
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ""
        res.on("data", (chunk) => (data += chunk))
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Inter OAuth failed: ${res.statusCode} ${data}`))
            return
          }
          const parsed: InterTokenResponse = JSON.parse(data)
          resolve(parsed.access_token)
        })
      }
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

/**
 * Fetch bank statement from Inter API.
 * Date range max 90 days per Inter API limitation.
 */
export async function fetchStatements(
  config: InterConfig,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<Array<{
  externalId: string
  date: string
  amount: number
  description: string
  payerName: string | null
  type: "CREDIT" | "DEBIT"
}>> {
  const token = await getAccessToken(config)
  const agent = createAgent(config)

  const url = `https://cdpj.partners.bancointer.com.br/banking/v2/extrato?dataInicio=${startDate}&dataFim=${endDate}`

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "GET",
      agent,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Inter statement fetch failed: ${res.statusCode} ${data}`))
          return
        }
        const parsed: InterStatementResponse = JSON.parse(data)
        const transactions = (parsed.transacoes || []).map(tx => ({
          externalId: tx.idTransacao,
          date: tx.dataLancamento || tx.dataEntradaContaBancaria,
          amount: parseFloat(tx.valor),
          description: tx.descricao || tx.titulo || "",
          payerName: extractPayerName(tx.descricao || tx.titulo || ""),
          type: (tx.tipoOperacao === "C" ? "CREDIT" : "DEBIT") as "CREDIT" | "DEBIT",
        }))
        resolve(transactions)
      })
    })
    req.on("error", reject)
    req.end()
  })
}

/**
 * Extract payer name from PIX description.
 * Inter PIX descriptions typically contain the sender's name.
 * Format varies: "PIX - Maria Silva - 05/03/2026" or "PIX Maria Silva"
 */
function extractPayerName(description: string): string | null {
  if (!description) return null
  // Try to extract name from common Inter PIX formats
  // "PIX - Nome Completo - data" or "PIX Nome Completo"
  const match = description.match(/PIX\s*[-–]?\s*(.+?)(?:\s*[-–]\s*\d|$)/i)
  if (match?.[1]) {
    const name = match[1].trim()
    // Filter out things that aren't names (numbers, dates, etc.)
    if (name && !/^\d+$/.test(name)) return name
  }
  return description.trim() || null
}
```

**Step 2: Commit**

```bash
git add src/lib/bank-reconciliation/inter-client.ts
git commit -m "feat(bank-reconciliation): add Inter bank API client with mTLS auth"
```

---

### Task 5: Barrel export

**Files:**
- Create: `src/lib/bank-reconciliation/index.ts`

**Step 1: Create barrel**

```typescript
// src/lib/bank-reconciliation/index.ts
export { encrypt, decrypt } from "./encryption"
export { matchTransactions, normalizeForComparison, nameSimilarity } from "./matcher"
export { fetchStatements } from "./inter-client"
export type {
  TransactionForMatching,
  InvoiceForMatching,
  MatchConfidence,
  MatchCandidate,
  MatchResult,
} from "./types"
export type { InterConfig } from "./inter-client"
```

**Step 2: Commit**

```bash
git add src/lib/bank-reconciliation/index.ts
git commit -m "feat(bank-reconciliation): add barrel index"
```

---

### Task 6: API — Integration CRUD

**Files:**
- Create: `src/app/api/financeiro/conciliacao/integration/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/financeiro/conciliacao/integration/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { encrypt, decrypt } from "@/lib/bank-reconciliation"

const createSchema = z.object({
  clientId: z.string().min(1, "Client ID é obrigatório"),
  clientSecret: z.string().min(1, "Client Secret é obrigatório"),
  certificate: z.string().min(1, "Certificado é obrigatório"),
  privateKey: z.string().min(1, "Chave privada é obrigatória"),
  accountNumber: z.string().optional().nullable(),
})

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const integration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
      select: {
        id: true,
        provider: true,
        clientId: true,
        accountNumber: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ integration })
  }
)

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { clientId, clientSecret, certificate, privateKey, accountNumber } = parsed.data

    // Upsert — one integration per clinic per provider
    const integration = await prisma.bankIntegration.upsert({
      where: {
        clinicId_provider: {
          clinicId: user.clinicId,
          provider: "INTER",
        },
      },
      create: {
        clinicId: user.clinicId,
        provider: "INTER",
        clientId,
        clientSecret: encrypt(clientSecret),
        certificate: encrypt(certificate),
        privateKey: encrypt(privateKey),
        accountNumber: accountNumber || null,
      },
      update: {
        clientId,
        clientSecret: encrypt(clientSecret),
        certificate: encrypt(certificate),
        privateKey: encrypt(privateKey),
        accountNumber: accountNumber || null,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        clientId: true,
        accountNumber: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ integration }, { status: 201 })
  }
)
```

**Step 2: Commit**

```bash
git add src/app/api/financeiro/conciliacao/integration/route.ts
git commit -m "feat(bank-reconciliation): add integration CRUD API route"
```

---

### Task 7: API — Fetch transactions

**Files:**
- Create: `src/app/api/financeiro/conciliacao/fetch/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/financeiro/conciliacao/fetch/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { fetchStatements } from "@/lib/bank-reconciliation"
import type { InterConfig } from "@/lib/bank-reconciliation"

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const integration = await prisma.bankIntegration.findFirst({
      where: { clinicId: user.clinicId, isActive: true },
    })

    if (!integration) {
      return NextResponse.json(
        { error: "Integração bancária não configurada" },
        { status: 400 }
      )
    }

    // Last 30 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const formatDate = (d: Date) => d.toISOString().split("T")[0]

    const config: InterConfig = {
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      certificate: integration.certificate,
      privateKey: integration.privateKey,
    }

    let transactions
    try {
      transactions = await fetchStatements(config, formatDate(startDate), formatDate(endDate))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao conectar com o banco"
      return NextResponse.json({ error: message }, { status: 502 })
    }

    // Only store CREDIT transactions (payments received)
    const credits = transactions.filter(tx => tx.type === "CREDIT")

    // Upsert: skip duplicates via externalId
    let newCount = 0
    for (const tx of credits) {
      const existing = await prisma.bankTransaction.findUnique({
        where: {
          clinicId_externalId: {
            clinicId: user.clinicId,
            externalId: tx.externalId,
          },
        },
      })

      if (!existing) {
        await prisma.bankTransaction.create({
          data: {
            clinicId: user.clinicId,
            bankIntegrationId: integration.id,
            externalId: tx.externalId,
            date: new Date(tx.date),
            amount: tx.amount,
            description: tx.description,
            payerName: tx.payerName,
            type: tx.type,
          },
        })
        newCount++
      }
    }

    return NextResponse.json({
      fetched: credits.length,
      newTransactions: newCount,
      period: {
        start: formatDate(startDate),
        end: formatDate(endDate),
      },
    })
  }
)
```

**Step 2: Commit**

```bash
git add src/app/api/financeiro/conciliacao/fetch/route.ts
git commit -m "feat(bank-reconciliation): add fetch transactions API route"
```

---

### Task 8: API — List transactions with matches

**Files:**
- Create: `src/app/api/financeiro/conciliacao/transactions/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/financeiro/conciliacao/transactions/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { matchTransactions } from "@/lib/bank-reconciliation"
import type { TransactionForMatching, InvoiceForMatching } from "@/lib/bank-reconciliation"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const showReconciled = searchParams.get("showReconciled") === "true"

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      type: "CREDIT",
    }
    if (!showReconciled) {
      where.reconciledInvoiceId = null
    }

    const [transactions, invoices] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { date: "desc" },
        take: 200,
      }),
      prisma.invoice.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["PENDENTE", "ENVIADO"] },
        },
        select: {
          id: true,
          patientId: true,
          totalAmount: true,
          referenceMonth: true,
          referenceYear: true,
          status: true,
          patient: {
            select: {
              name: true,
              motherName: true,
              fatherName: true,
            },
          },
        },
      }),
    ])

    // Map to domain types
    const txForMatching: TransactionForMatching[] = transactions
      .filter(tx => tx.reconciledInvoiceId === null)
      .map(tx => ({
        id: tx.id,
        date: tx.date,
        amount: Number(tx.amount),
        description: tx.description,
        payerName: tx.payerName,
      }))

    const invForMatching: InvoiceForMatching[] = invoices.map(inv => ({
      id: inv.id,
      patientId: inv.patientId,
      patientName: inv.patient.name,
      motherName: inv.patient.motherName,
      fatherName: inv.patient.fatherName,
      totalAmount: Number(inv.totalAmount),
      referenceMonth: inv.referenceMonth,
      referenceYear: inv.referenceYear,
      status: inv.status,
    }))

    const matchResults = matchTransactions(txForMatching, invForMatching)

    // Build response: all transactions (reconciled + unreconciled with matches)
    const response = transactions.map(tx => {
      const match = matchResults.find(m => m.transaction.id === tx.id)
      return {
        id: tx.id,
        externalId: tx.externalId,
        date: tx.date,
        amount: Number(tx.amount),
        description: tx.description,
        payerName: tx.payerName,
        reconciledInvoiceId: tx.reconciledInvoiceId,
        reconciledAt: tx.reconciledAt,
        candidates: match?.candidates.map(c => ({
          invoiceId: c.invoice.id,
          patientName: c.invoice.patientName,
          motherName: c.invoice.motherName,
          fatherName: c.invoice.fatherName,
          totalAmount: c.invoice.totalAmount,
          referenceMonth: c.invoice.referenceMonth,
          referenceYear: c.invoice.referenceYear,
          confidence: c.confidence,
          nameScore: c.nameScore,
          matchedField: c.matchedField,
        })) || [],
      }
    })

    return NextResponse.json({ transactions: response })
  }
)
```

**Step 2: Commit**

```bash
git add src/app/api/financeiro/conciliacao/transactions/route.ts
git commit -m "feat(bank-reconciliation): add transactions list API with match suggestions"
```

---

### Task 9: API — Reconcile (confirm matches)

**Files:**
- Create: `src/app/api/financeiro/conciliacao/reconcile/route.ts`

**Step 1: Write the route**

```typescript
// src/app/api/financeiro/conciliacao/reconcile/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

const schema = z.object({
  matches: z.array(z.object({
    transactionId: z.string(),
    invoiceId: z.string(),
  })).min(1, "Selecione pelo menos uma conciliação"),
})

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req, { user }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { matches } = parsed.data
    const now = new Date()

    // Validate all transactions and invoices belong to clinic
    const transactionIds = matches.map(m => m.transactionId)
    const invoiceIds = matches.map(m => m.invoiceId)

    const [transactions, invoices] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { id: { in: transactionIds }, clinicId: user.clinicId },
      }),
      prisma.invoice.findMany({
        where: { id: { in: invoiceIds }, clinicId: user.clinicId },
      }),
    ])

    if (transactions.length !== transactionIds.length) {
      return NextResponse.json({ error: "Transação não encontrada" }, { status: 404 })
    }
    if (invoices.length !== invoiceIds.length) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    // Check none already reconciled
    const alreadyReconciled = transactions.filter(tx => tx.reconciledInvoiceId)
    if (alreadyReconciled.length > 0) {
      return NextResponse.json(
        { error: "Algumas transações já foram conciliadas" },
        { status: 400 }
      )
    }

    // Check all invoices are PENDENTE or ENVIADO
    const invalidInvoices = invoices.filter(inv => !["PENDENTE", "ENVIADO"].includes(inv.status))
    if (invalidInvoices.length > 0) {
      return NextResponse.json(
        { error: "Algumas faturas não estão pendentes" },
        { status: 400 }
      )
    }

    // Apply reconciliation in transaction
    await prisma.$transaction(async (tx) => {
      for (const match of matches) {
        await tx.bankTransaction.update({
          where: { id: match.transactionId },
          data: {
            reconciledInvoiceId: match.invoiceId,
            reconciledAt: now,
            reconciledByUserId: user.id,
          },
        })

        await tx.invoice.update({
          where: { id: match.invoiceId },
          data: {
            status: "PAGO",
            paidAt: now,
          },
        })
      }
    })

    return NextResponse.json({
      reconciled: matches.length,
      message: `${matches.length} fatura(s) marcada(s) como paga(s)`,
    })
  }
)
```

**Step 2: Commit**

```bash
git add src/app/api/financeiro/conciliacao/reconcile/route.ts
git commit -m "feat(bank-reconciliation): add reconciliation confirm API route"
```

---

### Task 10: Add ENCRYPTION_KEY to environment

**Files:**
- Modify: `.env`
- Modify: `.env.example` (if it exists)

**Step 1: Generate a key and add to .env**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Add to `.env`:
```
ENCRYPTION_KEY=<generated_hex>
```

Add to `.env.example`:
```
ENCRYPTION_KEY=  # 64-char hex string (32 bytes) for encrypting bank integration secrets
```

**Step 2: No commit needed** (.env is gitignored; commit .env.example if it exists)

---

### Task 11: UI — Conciliação tab in Financeiro layout

**Files:**
- Modify: `src/app/financeiro/layout.tsx` (line 14)

**Step 1: Add tab**

Add to the `tabs` array after "Repasse":
```typescript
{ href: "/financeiro/conciliacao", label: "Conciliação" },
```

Also update the filter bar conditional (line 42) to exclude conciliação:
```typescript
!pathname.startsWith("/financeiro/conciliacao")
```

**Step 2: Commit**

```bash
git add src/app/financeiro/layout.tsx
git commit -m "feat(bank-reconciliation): add Conciliação tab to financeiro layout"
```

---

### Task 12: UI — Integration setup form

**Files:**
- Create: `src/app/financeiro/conciliacao/components/IntegrationForm.tsx`

**Step 1: Write the component**

```tsx
// src/app/financeiro/conciliacao/components/IntegrationForm.tsx
"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { SaveIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react"

interface Integration {
  id: string
  clientId: string
  accountNumber: string | null
  isActive: boolean
}

interface IntegrationFormProps {
  existing: Integration | null
  onSaved: () => void
}

export function IntegrationForm({ existing, onSaved }: IntegrationFormProps) {
  const [clientId, setClientId] = useState(existing?.clientId || "")
  const [clientSecret, setClientSecret] = useState("")
  const [certificate, setCertificate] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber || "")
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isOpen, setIsOpen] = useState(!existing)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, certificate, privateKey, accountNumber: accountNumber || null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao salvar")
      }
      toast.success("Integração salva com sucesso")
      setIsOpen(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar integração")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Integração Banco Inter</h3>
        {existing && (
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? "Fechar" : "Editar"}
          </Button>
        )}
      </div>

      {existing && !isOpen && (
        <div className="text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Configurado
          </span>
          <span className="ml-3">Client ID: {existing.clientId}</span>
          {existing.accountNumber && <span className="ml-3">Conta: {existing.accountNumber}</span>}
        </div>
      )}

      {isOpen && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Client Secret</label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder={existing ? "••••••••" : ""}
                className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-background text-sm"
                required={!existing}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Certificado (.crt / .pem)</label>
            <textarea
              value={certificate}
              onChange={e => setCertificate(e.target.value)}
              placeholder={existing ? "Cole o novo certificado para atualizar" : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm font-mono"
              required={!existing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Chave Privada (.key)</label>
            <textarea
              value={privateKey}
              onChange={e => setPrivateKey(e.target.value)}
              placeholder={existing ? "Cole a nova chave para atualizar" : "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm font-mono"
              required={!existing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Número da Conta (opcional)</label>
            <input
              type="text"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>

          <Button type="submit" disabled={saving} size="sm">
            {saving ? <Loader2Icon className="w-4 h-4 animate-spin mr-1" /> : <SaveIcon className="w-4 h-4 mr-1" />}
            {existing ? "Atualizar" : "Salvar"}
          </Button>
        </form>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/financeiro/conciliacao/components/IntegrationForm.tsx
git commit -m "feat(bank-reconciliation): add IntegrationForm UI component"
```

---

### Task 13: UI — Transaction list with match suggestions

**Files:**
- Create: `src/app/financeiro/conciliacao/components/TransactionList.tsx`

**Step 1: Write the component**

```tsx
// src/app/financeiro/conciliacao/components/TransactionList.tsx
"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"

interface Candidate {
  invoiceId: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
  nameScore: number
  matchedField: string | null
}

interface Transaction {
  id: string
  externalId: string
  date: string
  amount: number
  description: string
  payerName: string | null
  reconciledInvoiceId: string | null
  reconciledAt: string | null
  candidates: Candidate[]
}

interface TransactionListProps {
  transactions: Transaction[]
  onReconciled: () => void
}

const MONTH_NAMES = [
  "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

const confidenceColors: Record<string, string> = {
  HIGH: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
}

const confidenceLabels: Record<string, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
}

const fieldLabels: Record<string, string> = {
  motherName: "Mãe",
  fatherName: "Pai",
  patientName: "Paciente",
}

export function TransactionList({ transactions, onReconciled }: TransactionListProps) {
  // Map: transactionId -> selected invoiceId
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const tx of transactions) {
      if (!tx.reconciledInvoiceId && tx.candidates.length > 0 && tx.candidates[0].confidence !== "LOW") {
        initial[tx.id] = tx.candidates[0].invoiceId
      }
    }
    return initial
  })
  const [reconciling, setReconciling] = useState(false)

  const unreconciledTx = transactions.filter(tx => !tx.reconciledInvoiceId)
  const selectedCount = Object.keys(selections).length

  const toggleSelection = (txId: string, invoiceId: string) => {
    setSelections(prev => {
      const next = { ...prev }
      if (next[txId] === invoiceId) {
        delete next[txId]
      } else {
        next[txId] = invoiceId
      }
      return next
    })
  }

  const handleReconcile = async () => {
    if (selectedCount === 0) return
    setReconciling(true)
    try {
      const matches = Object.entries(selections).map(([transactionId, invoiceId]) => ({
        transactionId,
        invoiceId,
      }))
      const res = await fetch("/api/financeiro/conciliacao/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao conciliar")
      }
      const data = await res.json()
      toast.success(data.message)
      setSelections({})
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar")
    } finally {
      setReconciling(false)
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Nenhuma transação encontrada. Clique em &quot;Buscar Transações&quot; para importar.
      </div>
    )
  }

  return (
    <div>
      {selectedCount > 0 && (
        <div className="flex items-center justify-between mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <span className="text-sm font-medium">
            {selectedCount} conciliação(ões) selecionada(s)
          </span>
          <Button onClick={handleReconcile} disabled={reconciling} size="sm">
            {reconciling ? (
              <Loader2Icon className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <CheckIcon className="w-4 h-4 mr-1" />
            )}
            Confirmar Selecionados
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {unreconciledTx.map(tx => (
          <div key={tx.id} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium">
                  {formatCurrencyBRL(tx.amount)}
                  <span className="text-muted-foreground ml-2 font-normal">
                    {formatDateBR(tx.date)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {tx.payerName && <span className="font-medium text-foreground">{tx.payerName}</span>}
                  {tx.payerName && " — "}
                  {tx.description}
                </div>
              </div>
            </div>

            {tx.candidates.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">
                Nenhuma fatura pendente com este valor
              </div>
            ) : (
              <div className="space-y-1.5 mt-2">
                {tx.candidates.map(c => {
                  const isSelected = selections[tx.id] === c.invoiceId
                  return (
                    <button
                      key={c.invoiceId}
                      onClick={() => toggleSelection(tx.id, c.invoiceId)}
                      className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{c.patientName}</span>
                          <span className="text-muted-foreground ml-2">
                            {MONTH_NAMES[c.referenceMonth]}/{c.referenceYear}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {formatCurrencyBRL(c.totalAmount)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.matchedField && (
                            <span className="text-xs text-muted-foreground">
                              {fieldLabels[c.matchedField] || c.matchedField}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceColors[c.confidence]}`}>
                            {confidenceLabels[c.confidence]}
                          </span>
                          {isSelected && <CheckIcon className="w-4 h-4 text-primary" />}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/financeiro/conciliacao/components/TransactionList.tsx
git commit -m "feat(bank-reconciliation): add TransactionList UI component"
```

---

### Task 14: UI — Conciliação page

**Files:**
- Create: `src/app/financeiro/conciliacao/page.tsx`

**Step 1: Write the page**

```tsx
// src/app/financeiro/conciliacao/page.tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { RefreshCwIcon, Loader2Icon } from "lucide-react"
import { IntegrationForm } from "./components/IntegrationForm"
import { TransactionList } from "./components/TransactionList"

interface Integration {
  id: string
  clientId: string
  accountNumber: string | null
  isActive: boolean
}

export default function ConciliacaoPage() {
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [transactions, setTransactions] = useState([])
  const [loadingIntegration, setLoadingIntegration] = useState(true)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [fetching, setFetching] = useState(false)

  const fetchIntegration = useCallback(async () => {
    setLoadingIntegration(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/integration")
      const data = await res.json()
      setIntegration(data.integration || null)
    } finally {
      setLoadingIntegration(false)
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/transactions")
      const data = await res.json()
      setTransactions(data.transactions || [])
    } finally {
      setLoadingTransactions(false)
    }
  }, [])

  useEffect(() => {
    fetchIntegration()
    fetchTransactions()
  }, [fetchIntegration, fetchTransactions])

  const handleFetch = async () => {
    setFetching(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/fetch", { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao buscar transações")
      }
      const data = await res.json()
      toast.success(`${data.newTransactions} nova(s) transação(ões) importada(s)`)
      fetchTransactions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar transações")
    } finally {
      setFetching(false)
    }
  }

  if (loadingIntegration) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <IntegrationForm existing={integration} onSaved={fetchIntegration} />

      {integration && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Transações (últimos 30 dias)</h3>
            <Button onClick={handleFetch} disabled={fetching} size="sm" variant="outline">
              {fetching ? (
                <Loader2Icon className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <RefreshCwIcon className="w-4 h-4 mr-1" />
              )}
              Buscar Transações
            </Button>
          </div>

          {loadingTransactions ? (
            <div className="animate-pulse text-muted-foreground">Carregando transações...</div>
          ) : (
            <TransactionList
              transactions={transactions}
              onReconciled={fetchTransactions}
            />
          )}
        </>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/financeiro/conciliacao/page.tsx
git commit -m "feat(bank-reconciliation): add Conciliação page"
```

---

### Task 15: Run all tests and build

**Step 1: Run tests**

Run: `npx vitest run`
Expected: All existing + new tests pass.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Fix any issues found**

Address TypeScript errors or test failures.

**Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(bank-reconciliation): fix build issues"
```
