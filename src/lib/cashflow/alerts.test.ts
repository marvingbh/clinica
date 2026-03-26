import { describe, it, expect, vi } from "vitest"
import { detectAlerts } from "./alerts"
import type { CashFlowProjection } from "./types"

describe("detectAlerts", () => {
  it("detects negative balance", () => {
    const projection: CashFlowProjection = {
      entries: [
        { date: "2026-03-01", inflow: 0, outflow: 10000, net: -10000, runningBalance: -5000, details: { invoices: [], expenses: [], repasse: [] } },
      ],
      summary: { totalInflow: 0, totalOutflow: 10000, netFlow: -10000, startingBalance: 5000, projectedEndBalance: -5000 },
    }

    const alerts = detectAlerts(projection)
    const negative = alerts.find((a) => a.type === "NEGATIVE_BALANCE")
    expect(negative).toBeDefined()
    expect(negative!.date).toBe("2026-03-01")
  })

  it("detects large upcoming expenses", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1))

    const projection: CashFlowProjection = {
      entries: [
        { date: "2026-03-15", inflow: 0, outflow: 8000, net: -8000, runningBalance: 2000, details: { invoices: [], expenses: [], repasse: [] } },
      ],
      summary: { totalInflow: 0, totalOutflow: 8000, netFlow: -8000, startingBalance: 10000, projectedEndBalance: 2000 },
    }

    const alerts = detectAlerts(projection)
    const large = alerts.find((a) => a.type === "LARGE_UPCOMING_EXPENSE")
    expect(large).toBeDefined()
    expect(large!.amount).toBe(8000)

    vi.useRealTimers()
  })

  it("detects overdue concentration", () => {
    const overdueExpense = { id: "e", description: "x", amount: 1000, status: "OVERDUE" }
    const projection: CashFlowProjection = {
      entries: [
        { date: "2026-03-01", inflow: 0, outflow: 1000, net: -1000, runningBalance: 9000, details: { invoices: [], expenses: [overdueExpense], repasse: [] } },
        { date: "2026-03-02", inflow: 0, outflow: 1000, net: -1000, runningBalance: 8000, details: { invoices: [], expenses: [{ ...overdueExpense, id: "e2" }], repasse: [] } },
        { date: "2026-03-03", inflow: 0, outflow: 1000, net: -1000, runningBalance: 7000, details: { invoices: [], expenses: [{ ...overdueExpense, id: "e3" }], repasse: [] } },
      ],
      summary: { totalInflow: 0, totalOutflow: 3000, netFlow: -3000, startingBalance: 10000, projectedEndBalance: 7000 },
    }

    const alerts = detectAlerts(projection)
    const overdue = alerts.find((a) => a.type === "OVERDUE_CONCENTRATION")
    expect(overdue).toBeDefined()
    expect(overdue!.amount).toBe(3000)
  })

  it("returns no alerts for healthy projection", () => {
    const projection: CashFlowProjection = {
      entries: [
        { date: "2026-03-01", inflow: 5000, outflow: 2000, net: 3000, runningBalance: 13000, details: { invoices: [], expenses: [], repasse: [] } },
      ],
      summary: { totalInflow: 5000, totalOutflow: 2000, netFlow: 3000, startingBalance: 10000, projectedEndBalance: 13000 },
    }

    const alerts = detectAlerts(projection)
    expect(alerts).toHaveLength(0)
  })
})
