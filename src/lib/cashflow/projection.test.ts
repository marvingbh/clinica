import { describe, it, expect } from "vitest"
import { calculateProjection } from "./projection"
import type { InvoiceForCashFlow, ExpenseForCashFlow, RepasseForCashFlow } from "./types"

describe("calculateProjection", () => {
  const start = new Date(2026, 2, 1) // March 1
  const end = new Date(2026, 2, 5)   // March 5

  it("returns empty entries for no data", () => {
    const result = calculateProjection([], [], [], start, end)
    expect(result.entries).toHaveLength(5)
    expect(result.summary.totalInflow).toBe(0)
    expect(result.summary.totalOutflow).toBe(0)
    expect(result.summary.netFlow).toBe(0)
    expect(result.summary.projectedEndBalance).toBe(0)
  })

  it("buckets invoices as inflows on dueDate", () => {
    const invoices: InvoiceForCashFlow[] = [
      { id: "inv-1", totalAmount: 1000, dueDate: new Date(2026, 2, 3), paidAt: null, status: "PENDENTE" },
    ]
    const result = calculateProjection(invoices, [], [], start, end)

    const day3 = result.entries.find((e) => e.date === "2026-03-03")!
    expect(day3.inflow).toBe(1000)
    expect(day3.outflow).toBe(0)
    expect(day3.net).toBe(1000)
    expect(result.summary.totalInflow).toBe(1000)
  })

  it("buckets expenses as outflows", () => {
    const expenses: ExpenseForCashFlow[] = [
      { id: "exp-1", description: "Aluguel", amount: 5000, dueDate: new Date(2026, 2, 1), paidAt: null, status: "OPEN" },
    ]
    const result = calculateProjection([], expenses, [], start, end)

    const day1 = result.entries.find((e) => e.date === "2026-03-01")!
    expect(day1.outflow).toBe(5000)
    expect(day1.net).toBe(-5000)
    expect(result.summary.totalOutflow).toBe(5000)
  })

  it("calculates running balance correctly", () => {
    const invoices: InvoiceForCashFlow[] = [
      { id: "inv-1", totalAmount: 3000, dueDate: new Date(2026, 2, 2), paidAt: null, status: "PENDENTE" },
    ]
    const expenses: ExpenseForCashFlow[] = [
      { id: "exp-1", description: "Aluguel", amount: 5000, dueDate: new Date(2026, 2, 1), paidAt: null, status: "OPEN" },
    ]
    const result = calculateProjection(invoices, expenses, [], start, end, 10000)

    expect(result.entries[0].runningBalance).toBe(5000)  // 10000 - 5000
    expect(result.entries[1].runningBalance).toBe(8000)  // 5000 + 3000
    expect(result.summary.startingBalance).toBe(10000)
    expect(result.summary.projectedEndBalance).toBe(8000)
  })

  it("uses paidAt over dueDate for realized transactions", () => {
    const invoices: InvoiceForCashFlow[] = [
      { id: "inv-1", totalAmount: 1000, dueDate: new Date(2026, 2, 5), paidAt: new Date(2026, 2, 2), status: "PAGO" },
    ]
    const result = calculateProjection(invoices, [], [], start, end)

    const day2 = result.entries.find((e) => e.date === "2026-03-02")!
    expect(day2.inflow).toBe(1000)
    const day5 = result.entries.find((e) => e.date === "2026-03-05")!
    expect(day5.inflow).toBe(0) // Not on dueDate since paidAt is used
  })

  it("includes repasse as outflow", () => {
    const repasse: RepasseForCashFlow[] = [
      { id: "rep-1", repasseAmount: 2000, referenceMonth: 3, referenceYear: 2026, paidAt: null, professionalName: "Dr. Silva" },
    ]
    // Repasse uses 15th of reference month as proxy — outside our 1-5 window
    const extendedEnd = new Date(2026, 2, 20)
    const result = calculateProjection([], [], repasse, start, extendedEnd)

    const day15 = result.entries.find((e) => e.date === "2026-03-15")!
    expect(day15.outflow).toBe(2000)
    expect(day15.details.repasse).toHaveLength(1)
    expect(day15.details.repasse[0].professionalName).toBe("Dr. Silva")
  })

  it("ignores transactions outside the window", () => {
    const invoices: InvoiceForCashFlow[] = [
      { id: "inv-1", totalAmount: 1000, dueDate: new Date(2026, 2, 10), paidAt: null, status: "PENDENTE" },
    ]
    const result = calculateProjection(invoices, [], [], start, end)
    expect(result.summary.totalInflow).toBe(0) // March 10 is outside 1-5
  })

  it("aggregates multiple entries on the same day", () => {
    const expenses: ExpenseForCashFlow[] = [
      { id: "exp-1", description: "Aluguel", amount: 3000, dueDate: new Date(2026, 2, 1), paidAt: null, status: "OPEN" },
      { id: "exp-2", description: "Energia", amount: 500, dueDate: new Date(2026, 2, 1), paidAt: null, status: "OPEN" },
    ]
    const result = calculateProjection([], expenses, [], start, end)

    const day1 = result.entries.find((e) => e.date === "2026-03-01")!
    expect(day1.outflow).toBe(3500)
    expect(day1.details.expenses).toHaveLength(2)
  })

  it("marks entries as projected when todayStr is provided", () => {
    const invoices: InvoiceForCashFlow[] = [
      { id: "inv-1", totalAmount: 1000, dueDate: new Date(2026, 2, 2), paidAt: new Date(2026, 2, 2), status: "PAGO" },
      { id: "inv-2", totalAmount: 500, dueDate: new Date(2026, 2, 4), paidAt: null, status: "PENDENTE" },
    ]
    const result = calculateProjection(invoices, [], [], start, end, 0, "2026-03-03")

    const day2 = result.entries.find((e) => e.date === "2026-03-02")!
    expect(day2.isProjected).toBe(false) // on or before today

    const day3 = result.entries.find((e) => e.date === "2026-03-03")!
    expect(day3.isProjected).toBe(false) // today itself

    const day4 = result.entries.find((e) => e.date === "2026-03-04")!
    expect(day4.isProjected).toBe(true) // after today
  })

  it("does not set isProjected when todayStr is undefined", () => {
    const result = calculateProjection([], [], [], start, end)
    expect(result.entries[0].isProjected).toBeUndefined()
  })
})
