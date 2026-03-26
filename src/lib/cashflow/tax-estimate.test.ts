import { describe, it, expect } from "vitest"
import { estimateTax } from "./tax-estimate"

describe("estimateTax", () => {
  it("returns fixed DAS for MEI", () => {
    const result = estimateTax("1", 10000, 3)
    expect(result.regime).toBe("MEI")
    expect(result.totalTax).toBe(75.90)
    expect(result.monthlyTotal).toBe(75.90)
    expect(result.quarterlyTotal).toBe(0)
    expect(result.quarterlyDueThisMonth).toBe(false)
  })

  it("calculates Simples Nacional (always monthly)", () => {
    const result = estimateTax("2", 10000, 4, undefined, 120_000)
    expect(result.regime).toBe("Simples Nacional")
    expect(result.quarterlyDueThisMonth).toBe(false)
    expect(result.monthlyTotal).toBeCloseTo(600, 0)
  })

  describe("Lucro Presumido", () => {
    it("shows only monthly taxes (PIS+COFINS+ISS) in non-quarter months", () => {
      // May is NOT a quarterly payment month
      const result = estimateTax("3", 120000, 5, undefined, 0, 0.03)
      expect(result.regime).toBe("Lucro Presumido")
      expect(result.quarterlyDueThisMonth).toBe(false)

      // Monthly: ISS(3%) + PIS(0.65%) + COFINS(3%) = 6.65%
      expect(result.breakdown.filter(b => b.period === "mensal")).toHaveLength(3)
      expect(result.breakdown.filter(b => b.period === "trimestral")).toHaveLength(0)

      const iss = result.breakdown.find(b => b.name === "ISS")!
      expect(iss.amount).toBe(3600) // 120000 * 3%

      const pis = result.breakdown.find(b => b.name === "PIS")!
      expect(pis.amount).toBe(780) // 120000 * 0.65%

      const cofins = result.breakdown.find(b => b.name === "COFINS")!
      expect(cofins.amount).toBe(3600) // 120000 * 3%

      expect(result.monthlyTotal).toBe(7980)
      expect(result.quarterlyTotal).toBe(0)
      expect(result.totalTax).toBe(7980)
    })

    it("includes quarterly taxes (IRPJ+CSLL) in April (Q1 payment)", () => {
      // April: monthly taxes + Q1 quarterly taxes
      const result = estimateTax("3", 120000, 4, 360000, 0, 0.03)
      expect(result.quarterlyDueThisMonth).toBe(true)

      // Monthly: same as above = 7980
      expect(result.monthlyTotal).toBe(7980)

      // Quarterly: on 360000 quarter revenue
      // Presumed base: 360000 * 32% = 115200
      // IRPJ: 115200 * 15% = 17280 + (115200 - 60000) * 10% = 5520 → 22800
      // CSLL: 115200 * 9% = 10368
      const irpj = result.breakdown.find(b => b.name === "IRPJ (trimestral)")!
      expect(irpj.amount).toBe(22800)

      const csll = result.breakdown.find(b => b.name === "CSLL (trimestral)")!
      expect(csll.amount).toBe(10368)

      expect(result.quarterlyTotal).toBe(33168)
      expect(result.totalTax).toBe(7980 + 33168)
    })

    it("includes quarterly taxes in July, October, January", () => {
      for (const month of [1, 7, 10]) {
        const result = estimateTax("3", 100000, month, 300000, 0, 0.03)
        expect(result.quarterlyDueThisMonth).toBe(true)
        expect(result.quarterlyTotal).toBeGreaterThan(0)
      }
    })

    it("does NOT include quarterly taxes in Feb, Mar, May, Jun, Aug, Sep, Nov, Dec", () => {
      for (const month of [2, 3, 5, 6, 8, 9, 11, 12]) {
        const result = estimateTax("3", 100000, month, undefined, 0, 0.03)
        expect(result.quarterlyDueThisMonth).toBe(false)
        expect(result.quarterlyTotal).toBe(0)
      }
    })

    it("estimates quarter revenue as monthly × 3 when not provided", () => {
      const result = estimateTax("3", 100000, 4, undefined, 0, 0.03)
      // Quarter revenue = 100000 * 3 = 300000
      // Presumed base: 300000 * 32% = 96000
      // IRPJ: 96000 * 15% = 14400 + (96000 - 60000) * 10% = 3600 → 18000
      const irpj = result.breakdown.find(b => b.name === "IRPJ (trimestral)")!
      expect(irpj.amount).toBe(18000)
    })

    it("no IRPJ additional when presumed profit <= R$60k", () => {
      // Quarter revenue = 60000, presumed base = 19200 (< 60k threshold)
      const result = estimateTax("3", 20000, 4, 60000, 0, 0.03)
      const irpj = result.breakdown.find(b => b.name === "IRPJ (trimestral)")!
      // 60000 * 32% = 19200, IRPJ = 19200 * 15% = 2880, no additional
      expect(irpj.amount).toBe(2880)
    })

    it("shows nextQuarterlyDueMonth when not due this month", () => {
      const may = estimateTax("3", 100000, 5)
      expect(may.nextQuarterlyDueMonth).toBe(7) // July

      const nov = estimateTax("3", 100000, 11)
      expect(nov.nextQuarterlyDueMonth).toBe(1) // January (wraps)
    })
  })

  it("returns zero for zero revenue", () => {
    const result = estimateTax("3", 0, 4)
    expect(result.totalTax).toBe(0)
  })
})
