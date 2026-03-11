import { describe, it, expect } from "vitest"
import { matchTransactions, normalizeForComparison, nameSimilarity, surnameMatches, nameContainedIn, findGroupCandidates, findSamePatientGroups } from "./matcher"
import type { InvoiceWithParent } from "./matcher"
import { extractPayerName } from "./inter-client"
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
  remainingAmount: 500,
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

  it("strips parenthetical content like nicknames", () => {
    expect(normalizeForComparison("Sara Vernaschi da Silva (Letícia)")).toBe("sara vernaschi da silva")
    expect(normalizeForComparison("João (Juca) Santos")).toBe("joao santos")
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

describe("surnameMatches", () => {
  it("returns true when patient surname appears in payer name", () => {
    expect(surnameMatches("Ana Oliveira", "João Oliveira")).toBe(true)
  })

  it("is case and accent insensitive", () => {
    expect(surnameMatches("ANA OLIVEIRA", "joão oliveira")).toBe(true)
  })

  it("returns false when surname does not appear", () => {
    expect(surnameMatches("Ana Santos", "João Oliveira")).toBe(false)
  })

  it("returns false for single-name patients", () => {
    expect(surnameMatches("Maria", "João")).toBe(false)
  })

  it("skips short surnames (da, de, dos) and uses second-to-last", () => {
    // Patient "João Oliveira da" → effectiveSurname = "oliveira"
    expect(surnameMatches("Ana Oliveira", "João Oliveira da")).toBe(true)
  })

  it("returns false for empty inputs", () => {
    expect(surnameMatches("", "João Silva")).toBe(false)
    expect(surnameMatches("Ana Silva", "")).toBe(false)
  })
})

describe("nameContainedIn", () => {
  it("returns true when short name is fully contained in longer name", () => {
    expect(nameContainedIn("Diego", "DIEGO CARLOS VERNASCHI DA SILVA")).toBe(true)
  })

  it("returns true when multi-word name is contained", () => {
    expect(nameContainedIn("Diego Carlos", "DIEGO CARLOS VERNASCHI DA SILVA")).toBe(true)
  })

  it("returns false when name is not contained", () => {
    expect(nameContainedIn("Letícia", "DIEGO CARLOS VERNASCHI DA SILVA")).toBe(false)
  })

  it("ignores short words (da, de, dos) in the name", () => {
    // "da" is filtered out (length <= 2), only "silva" checked
    expect(nameContainedIn("da Silva", "DIEGO CARLOS VERNASCHI DA SILVA")).toBe(true)
  })

  it("returns false for empty names", () => {
    expect(nameContainedIn("", "DIEGO CARLOS")).toBe(false)
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

  it("only matches invoices with PENDENTE, ENVIADO, PAGO or PARCIAL status", () => {
    const transactions = [makeTransaction()]
    const invoices = [
      makeInvoice({ id: "inv1", status: "CANCELADO" }),
      makeInvoice({ id: "inv2", status: "PENDENTE" }),
      makeInvoice({ id: "inv3", patientId: "p3", status: "PAGO", totalAmount: 500 }),
    ]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(2)
    expect(results[0].candidates.map((c: { invoice: { id: string } }) => c.invoice.id).sort()).toEqual(["inv2", "inv3"])
  })

  it("handles multiple transactions", () => {
    const transactions = [
      makeTransaction({ id: "tx1", amount: 500 }),
      makeTransaction({ id: "tx2", amount: 300 }),
    ]
    const invoices = [
      makeInvoice({ id: "inv1", totalAmount: 500 }),
      makeInvoice({ id: "inv2", patientId: "p2", totalAmount: 300, remainingAmount: 300 }),
    ]
    const results = matchTransactions(transactions, invoices)
    expect(results).toHaveLength(2)
    expect(results[0].candidates[0].invoice.id).toBe("inv1")
    expect(results[1].candidates[0].invoice.id).toBe("inv2")
  })

  it("gives MEDIUM confidence via surname match when no parent name matches well", () => {
    // payerName "Roberto Costa Oliveira" won't match mother/father names well,
    // but patient surname "Oliveira" appears in payer name → surname fallback
    const transactions = [makeTransaction({ payerName: "Roberto Costa Oliveira" })]
    const invoices = [makeInvoice({
      patientName: "Lucas Oliveira",
      motherName: "Ana Santos",
      fatherName: "Pedro Souza",
    })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("MEDIUM")
    expect(results[0].candidates[0].matchedField).toBe("patientSurname")
  })

  it("gives HIGH confidence when parent AND patient words both match payer", () => {
    // Father "Diego" matches payer, patient "Vernaschi" uniquely matches payer → combined HIGH
    const transactions = [makeTransaction({ payerName: "DIEGO CARLOS VERNASCHI DA SILVA" })]
    const invoices = [makeInvoice({
      patientName: "Sara Marinho Martins Vernaschi da Silva",
      motherName: "Letícia",
      fatherName: "Diego",
    })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("HIGH")
    expect(results[0].candidates[0].matchedField).toBe("fatherName")
  })

  it("gives HIGH with parenthetical nicknames stripped", () => {
    const transactions = [makeTransaction({ payerName: "DIEGO CARLOS VERNASCHI DA SILVA" })]
    const invoices = [makeInvoice({
      patientName: "Sara Marinho Martins Vernaschi da Silva (Letícia)",
      motherName: "Letícia",
      fatherName: "Diego",
    })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("HIGH")
    expect(results[0].candidates[0].matchedField).toBe("fatherName")
  })

  it("gives HIGH when mother name + patient surname both match payer", () => {
    // Mother "Ana Carolina" → "ana" matches payer, patient "Buzelin" uniquely matches payer
    const transactions = [makeTransaction({ payerName: "ANA C JORGE BUZELIN" })]
    const invoices = [makeInvoice({
      patientName: "Samir Buzelin Dzaferagic (Ana Carolina)",
      motherName: "Ana Carolina",
      fatherName: "Kenan",
    })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates[0].confidence).toBe("HIGH")
    expect(results[0].candidates[0].matchedField).toBe("motherName")
  })

  it("does not give HIGH when patient word overlap is same as parent word", () => {
    // "Silva" appears in both parent and patient — not a unique patient signal
    const transactions = [makeTransaction({ payerName: "Maria Silva Santos" })]
    const invoices = [makeInvoice({
      patientName: "João Silva",
      motherName: "Maria Silva",
      fatherName: "Carlos Santos",
    })]
    const results = matchTransactions(transactions, invoices)
    // Should stay MEDIUM from individual scoring, not jump to HIGH
    expect(results[0].candidates[0].confidence).toBe("MEDIUM")
  })

  it("matches on remainingAmount for partially paid invoices", () => {
    const transactions = [makeTransaction({ amount: 200 })]
    const invoices = [makeInvoice({ totalAmount: 500, remainingAmount: 200 })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(1)
  })

  it("returns empty candidates for transaction with no matching invoices", () => {
    const transactions = [makeTransaction({ amount: 777 })]
    const invoices = [makeInvoice({ totalAmount: 500 })]
    const results = matchTransactions(transactions, invoices)
    expect(results[0].candidates).toHaveLength(0)
  })
})

const makeInvoiceWithParent = (overrides: Partial<InvoiceWithParent> = {}): InvoiceWithParent => ({
  id: "inv1",
  patientId: "p1",
  patientName: "João Silva",
  motherName: "Maria Silva",
  fatherName: "Carlos Silva",
  totalAmount: 250,
  remainingAmount: 250,
  referenceMonth: 3,
  referenceYear: 2026,
  status: "PENDENTE",
  normalizedMother: "maria silva",
  normalizedFather: "carlos silva",
  ...overrides,
})

describe("findGroupCandidates", () => {
  it("finds a pair of invoices that sum to the transaction amount with shared parent", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", totalAmount: 300, remainingAmount: 300 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p2", patientName: "Ana Silva", totalAmount: 200, remainingAmount: 200 }),
    ]
    const groups = findGroupCandidates(500, "Maria Silva", invoices)
    expect(groups).toHaveLength(1)
    expect(groups[0].invoices.map(i => i.id).sort()).toEqual(["inv1", "inv2"])
    expect(groups[0].sharedParent).toBe("Maria Silva")
  })

  it("returns empty when amounts don't sum", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", totalAmount: 300, remainingAmount: 300 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p2", totalAmount: 300, remainingAmount: 300 }),
    ]
    const groups = findGroupCandidates(500, "Maria Silva", invoices)
    expect(groups).toHaveLength(0)
  })

  it("returns empty when no shared parent", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", totalAmount: 300, remainingAmount: 300, normalizedMother: "ana", normalizedFather: "pedro" }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p2", totalAmount: 200, remainingAmount: 200, normalizedMother: "julia", normalizedFather: "marcos" }),
    ]
    const groups = findGroupCandidates(500, null, invoices)
    expect(groups).toHaveLength(0)
  })

  it("skips pairs where payer name doesn't overlap with shared parent", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", totalAmount: 300, remainingAmount: 300 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p2", totalAmount: 200, remainingAmount: 200 }),
    ]
    const groups = findGroupCandidates(500, "Unknown Person", invoices)
    expect(groups).toHaveLength(0)
  })

  it("works without payer name (no payer filtering)", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", totalAmount: 300, remainingAmount: 300 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p2", totalAmount: 200, remainingAmount: 200 }),
    ]
    const groups = findGroupCandidates(500, null, invoices)
    expect(groups).toHaveLength(1)
  })
})

describe("findSamePatientGroups", () => {
  it("matches 4 invoices of same patient summing to transaction amount", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv3", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv4", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
    ]
    const groups = findSamePatientGroups(800, "Maria Silva", invoices)
    expect(groups).toHaveLength(1)
    expect(groups[0].invoices).toHaveLength(4)
    expect(groups[0].invoices.map(i => i.id).sort()).toEqual(["inv1", "inv2", "inv3", "inv4"])
    expect(groups[0].sharedParent).toBe("Maria Silva")
  })

  it("returns no match when sum does not equal transaction amount", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv3", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
    ]
    // 3 x 200 = 600, but txAmount is 800
    const groups = findSamePatientGroups(800, "Maria Silva", invoices)
    expect(groups).toHaveLength(0)
  })

  it("does not group invoices from different patients", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p2", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv3", patientId: "p3", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv4", patientId: "p4", remainingAmount: 200, totalAmount: 200 }),
    ]
    const groups = findSamePatientGroups(800, null, invoices)
    expect(groups).toHaveLength(0)
  })

  it("skips groups when payer name doesn't overlap with parent", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
    ]
    const groups = findSamePatientGroups(400, "Unknown Person", invoices)
    expect(groups).toHaveLength(0)
  })

  it("works without payer name (no payer filtering)", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
    ]
    const groups = findSamePatientGroups(400, null, invoices)
    expect(groups).toHaveLength(1)
    expect(groups[0].invoices).toHaveLength(2)
  })

  it("matches a greedy subset when not all invoices sum to the amount", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", patientId: "p1", remainingAmount: 300, totalAmount: 300 }),
      makeInvoiceWithParent({ id: "inv2", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv3", patientId: "p1", remainingAmount: 200, totalAmount: 200 }),
      makeInvoiceWithParent({ id: "inv4", patientId: "p1", remainingAmount: 100, totalAmount: 100 }),
    ]
    // Total is 800, but tx is 500 → greedy: 300 + 200 = 500
    const groups = findSamePatientGroups(500, null, invoices)
    expect(groups).toHaveLength(1)
    expect(groups[0].invoices).toHaveLength(2)
    const sum = groups[0].invoices.reduce((s, inv) => s + inv.remainingAmount, 0)
    expect(sum).toBeCloseTo(500)
  })

  it("requires at least 2 invoices for a group (ignores single-invoice patients)", () => {
    const invoices = [
      makeInvoiceWithParent({ id: "inv1", patientId: "p1", remainingAmount: 800, totalAmount: 800 }),
    ]
    const groups = findSamePatientGroups(800, null, invoices)
    expect(groups).toHaveLength(0)
  })

  it("uses fatherName as sharedParent when motherName is empty", () => {
    const invoices = [
      makeInvoiceWithParent({
        id: "inv1", patientId: "p1", remainingAmount: 200, totalAmount: 200,
        normalizedMother: "", motherName: null,
        normalizedFather: "carlos silva", fatherName: "Carlos Silva",
      }),
      makeInvoiceWithParent({
        id: "inv2", patientId: "p1", remainingAmount: 200, totalAmount: 200,
        normalizedMother: "", motherName: null,
        normalizedFather: "carlos silva", fatherName: "Carlos Silva",
      }),
    ]
    const groups = findSamePatientGroups(400, "Carlos Silva", invoices)
    expect(groups).toHaveLength(1)
    expect(groups[0].sharedParent).toBe("Carlos Silva")
  })
})

describe("extractPayerName", () => {
  it("extracts name after CPF pattern", () => {
    expect(extractPayerName("PIX RECEBIDO - Cp :00000000-ADRIANA MC SIQUEIRA")).toBe("ADRIANA MC SIQUEIRA")
  })

  it("extracts name from internal PIX format", () => {
    expect(extractPayerName("PIX RECEBIDO INTERNO - 00019 7258666 SAVIO MOREIRA")).toBe("SAVIO MOREIRA")
  })

  it("extracts name after last dash as fallback", () => {
    expect(extractPayerName("TED RECEBIDO-MARIA SILVA")).toBe("MARIA SILVA")
  })

  it("returns null for empty string", () => {
    expect(extractPayerName("")).toBeNull()
  })

  it("returns null when no pattern matches", () => {
    expect(extractPayerName("TARIFA BANCARIA 123")).toBeNull()
  })
})
