import { describe, it, expect } from "vitest"
import { findReconcilableExpense } from "./reconcile-existing"

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
const CEMIG = "DEBITO CEMIG - 008108759559"
const PACTO_AMP = "PAGAMENTO DE TITULO - PACTO ADMINISTRADORA & CORRETORA DE SEGUROS LTDA"
const PACTO_E = "PAGAMENTO DE TITULO - PACTO ADMINISTRADORA E CORRETORA DE SEGUROS LTDA"

describe("findReconcilableExpense", () => {
  it("matches the same supplier and adopts the imported amount (variable bill)", () => {
    // Utility: recurrence estimated R$102,54 but the real bill imported is R$149,72.
    const match = findReconcilableExpense({ amount: 149.72, date: utc(2026, 5, 10), description: CEMIG }, [
      { id: "e1", amount: 102.54, dueDate: utc(2026, 5, 10), recurrenceId: "r1", description: CEMIG },
    ])
    expect(match?.expense.id).toBe("e1")
    expect(match?.adoptAmount).toBe(true)
  })

  it("prefers an exact-amount match and keeps the amount (fixed obligation)", () => {
    // Two distinct insurance policies from the same supplier in the same month.
    const match = findReconcilableExpense({ amount: 481.46, date: utc(2026, 5, 10), description: PACTO_AMP }, [
      { id: "policyA", amount: 481.46, dueDate: utc(2026, 5, 10), recurrenceId: "rA", description: PACTO_AMP },
      { id: "policyB", amount: 528.86, dueDate: utc(2026, 5, 10), recurrenceId: "rB", description: PACTO_AMP },
    ])
    expect(match?.expense.id).toBe("policyA")
    expect(match?.adoptAmount).toBe(false)
  })

  it("does not reconcile when 2+ non-exact candidates make it ambiguous", () => {
    const match = findReconcilableExpense({ amount: 600, date: utc(2026, 5, 10), description: PACTO_AMP }, [
      { id: "policyA", amount: 481.46, dueDate: utc(2026, 5, 10), recurrenceId: "rA", description: PACTO_AMP },
      { id: "policyB", amount: 528.86, dueDate: utc(2026, 5, 10), recurrenceId: "rB", description: PACTO_AMP },
    ])
    expect(match).toBeNull()
  })

  it("matches across cosmetic name differences (& vs E)", () => {
    const match = findReconcilableExpense({ amount: 528.86, date: utc(2026, 5, 10), description: PACTO_AMP }, [
      { id: "e1", amount: 528.86, dueDate: utc(2026, 5, 11), recurrenceId: "r1", description: PACTO_E },
    ])
    expect(match?.expense.id).toBe("e1")
  })

  it("does not match a different supplier", () => {
    const match = findReconcilableExpense({ amount: 149.72, date: utc(2026, 5, 10), description: CEMIG }, [
      { id: "e1", amount: 149.72, dueDate: utc(2026, 5, 10), recurrenceId: "r1", description: "DEBITO CEMIG - 000000000000" },
    ])
    expect(match).toBeNull()
  })

  it("does not match outside the date window", () => {
    const match = findReconcilableExpense({ amount: 149.72, date: utc(2026, 5, 28), description: CEMIG }, [
      { id: "e1", amount: 102.54, dueDate: utc(2026, 5, 1), recurrenceId: "r1", description: CEMIG },
    ])
    expect(match).toBeNull()
  })

  it("returns null when there are no open expenses", () => {
    expect(findReconcilableExpense({ amount: 100, date: utc(2026, 5, 10), description: CEMIG }, [])).toBeNull()
  })
})
