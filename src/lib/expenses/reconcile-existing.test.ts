import { describe, it, expect } from "vitest"
import { findReconcilableExpense } from "./reconcile-existing"

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

describe("findReconcilableExpense", () => {
  it("matches an open expense with exact amount within the date window", () => {
    const match = findReconcilableExpense({ amount: 1299.28, date: utc(2026, 5, 5) }, [
      { id: "e1", amount: 1299.28, dueDate: utc(2026, 5, 2), recurrenceId: "r1" },
    ])
    expect(match?.id).toBe("e1")
  })

  it("returns null when no amount matches", () => {
    const match = findReconcilableExpense({ amount: 1000, date: utc(2026, 5, 5) }, [
      { id: "e1", amount: 1299.28, dueDate: utc(2026, 5, 2), recurrenceId: "r1" },
    ])
    expect(match).toBeNull()
  })

  it("returns null when the only amount match is outside the date window", () => {
    const match = findReconcilableExpense({ amount: 500, date: utc(2026, 5, 28) }, [
      { id: "e1", amount: 500, dueDate: utc(2026, 5, 1), recurrenceId: null },
    ])
    expect(match).toBeNull()
  })

  it("prefers a recurring expense over a one-off when both match", () => {
    const match = findReconcilableExpense({ amount: 500, date: utc(2026, 5, 10) }, [
      { id: "avulsa", amount: 500, dueDate: utc(2026, 5, 10), recurrenceId: null },
      { id: "rec", amount: 500, dueDate: utc(2026, 5, 12), recurrenceId: "r1" },
    ])
    expect(match?.id).toBe("rec")
  })

  it("prefers the closest due date among same-kind matches", () => {
    const match = findReconcilableExpense({ amount: 500, date: utc(2026, 5, 10) }, [
      { id: "far", amount: 500, dueDate: utc(2026, 5, 1), recurrenceId: "r1" },
      { id: "near", amount: 500, dueDate: utc(2026, 5, 9), recurrenceId: "r2" },
    ])
    expect(match?.id).toBe("near")
  })
})
