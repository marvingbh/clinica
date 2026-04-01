import { describe, it, expect } from "vitest"
import { findAutoReconcileMatches, findRecurrenceCreationCandidates } from "./auto-reconcile"

describe("findAutoReconcileMatches", () => {
  const baseExpense = {
    amount: 5000,
    dueDate: new Date(2026, 2, 10),
    description: "Aluguel",
    recurrenceId: "rec-1",
    status: "OPEN" as const,
  }

  const baseTx = {
    amount: 5000,
    date: new Date(2026, 2, 10),
    description: "PIX ENVIO IMOBILIARIA ABC",
  }

  it("auto-matches when pattern has recurrenceId and amount matches", () => {
    const matches = findAutoReconcileMatches(
      [{ id: "tx-1", ...baseTx }],
      [{ id: "exp-1", ...baseExpense }],
      [{ normalizedDescription: "imobiliaria abc", categoryId: "cat-1", supplierName: "Imobiliária ABC", matchCount: 3, recurrenceId: "rec-1" }]
    )

    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe("auto")
    expect(matches[0].transactionId).toBe("tx-1")
    expect(matches[0].expenseId).toBe("exp-1")
  })

  it("suggests match when amount matches and date is close but no pattern", () => {
    const matches = findAutoReconcileMatches(
      [{ id: "tx-1", ...baseTx }],
      [{ id: "exp-1", ...baseExpense }],
      [] // no patterns
    )

    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe("suggested")
  })

  it("does not match when amounts differ", () => {
    const matches = findAutoReconcileMatches(
      [{ id: "tx-1", ...baseTx, amount: 5100 }],
      [{ id: "exp-1", ...baseExpense }],
      []
    )

    expect(matches).toHaveLength(0)
  })

  it("does not suggest when date is too far (>15 days)", () => {
    const matches = findAutoReconcileMatches(
      [{ id: "tx-1", ...baseTx, date: new Date(2026, 3, 1) }], // April 1, 22 days from March 10
      [{ id: "exp-1", ...baseExpense }],
      []
    )

    expect(matches).toHaveLength(0)
  })

  it("does not match PAID or CANCELLED expenses", () => {
    const matches = findAutoReconcileMatches(
      [{ id: "tx-1", ...baseTx }],
      [{ id: "exp-1", ...baseExpense, status: "PAID" }],
      []
    )

    expect(matches).toHaveLength(0)
  })

  it("matches one transaction to one expense only", () => {
    const matches = findAutoReconcileMatches(
      [{ id: "tx-1", ...baseTx }, { id: "tx-2", ...baseTx }],
      [{ id: "exp-1", ...baseExpense }],
      []
    )

    // Only one match — first tx claims the expense
    expect(matches).toHaveLength(1)
    expect(matches[0].transactionId).toBe("tx-1")
  })

  it("prefers auto over suggested for the same expense", () => {
    const matches = findAutoReconcileMatches(
      [{ id: "tx-1", ...baseTx }],
      [
        { id: "exp-1", ...baseExpense, recurrenceId: "rec-1" },
        { id: "exp-2", ...baseExpense, recurrenceId: null },
      ],
      [{ normalizedDescription: "imobiliaria abc", categoryId: "cat-1", supplierName: "Imobiliária ABC", matchCount: 3, recurrenceId: "rec-1" }]
    )

    expect(matches).toHaveLength(1)
    expect(matches[0].confidence).toBe("auto")
    expect(matches[0].expenseId).toBe("exp-1")
  })
})

describe("findRecurrenceCreationCandidates", () => {
  const baseTx = {
    amount: 831.68,
    date: new Date(2026, 3, 1), // April 1
    description: "PIX ENVIADO INTERNO - 00019 70802165 ARTHUR OLIVEIRA",
  }

  const pattern = {
    normalizedDescription: "interno - 00019 70802165 arthur oliveira",
    categoryId: null,
    supplierName: null,
    matchCount: 1,
    recurrenceId: "rec-1",
  }

  const activeRecurrences = new Map([["rec-1", { amount: 831.68 }]])

  it("returns candidate when pattern has recurrenceId, recurrence active, amount matches", () => {
    const candidates = findRecurrenceCreationCandidates(
      [{ id: "tx-1", ...baseTx }],
      [pattern],
      new Set(),
      activeRecurrences
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0].transactionId).toBe("tx-1")
    expect(candidates[0].recurrenceId).toBe("rec-1")
    expect(candidates[0].amount).toBe(831.68)
  })

  it("skips already-matched transactions", () => {
    const candidates = findRecurrenceCreationCandidates(
      [{ id: "tx-1", ...baseTx }],
      [pattern],
      new Set(["tx-1"]),
      activeRecurrences
    )

    expect(candidates).toHaveLength(0)
  })

  it("skips when pattern has no recurrenceId", () => {
    const candidates = findRecurrenceCreationCandidates(
      [{ id: "tx-1", ...baseTx }],
      [{ ...pattern, recurrenceId: null }],
      new Set(),
      activeRecurrences
    )

    expect(candidates).toHaveLength(0)
  })

  it("skips when recurrence is inactive (not in map)", () => {
    const candidates = findRecurrenceCreationCandidates(
      [{ id: "tx-1", ...baseTx }],
      [pattern],
      new Set(),
      new Map() // empty = no active recurrences
    )

    expect(candidates).toHaveLength(0)
  })

  it("skips when amount does not match recurrence", () => {
    const candidates = findRecurrenceCreationCandidates(
      [{ id: "tx-1", ...baseTx, amount: 900 }],
      [pattern],
      new Set(),
      activeRecurrences
    )

    expect(candidates).toHaveLength(0)
  })

  it("skips transactions with no matching pattern", () => {
    const candidates = findRecurrenceCreationCandidates(
      [{ id: "tx-1", ...baseTx, description: "SOMETHING ELSE" }],
      [pattern],
      new Set(),
      activeRecurrences
    )

    expect(candidates).toHaveLength(0)
  })

  it("returns multiple candidates for different recurrences", () => {
    const candidates = findRecurrenceCreationCandidates(
      [
        { id: "tx-1", ...baseTx },
        { id: "tx-2", amount: 500, date: new Date(2026, 3, 5), description: "PIX NETFLIX ASSINATURA" },
      ],
      [
        pattern,
        { normalizedDescription: "netflix assinatura", categoryId: "cat-2", supplierName: "Netflix", matchCount: 5, recurrenceId: "rec-2" },
      ],
      new Set(),
      new Map([["rec-1", { amount: 831.68 }], ["rec-2", { amount: 500 }]])
    )

    expect(candidates).toHaveLength(2)
    expect(candidates[0].recurrenceId).toBe("rec-1")
    expect(candidates[1].recurrenceId).toBe("rec-2")
  })
})
