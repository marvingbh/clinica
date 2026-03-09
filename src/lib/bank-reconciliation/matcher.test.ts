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
    expect(score).toBeGreaterThan(0.5)
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
