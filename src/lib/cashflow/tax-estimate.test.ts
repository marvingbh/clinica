import { describe, it, expect } from "vitest"
import { estimateTax } from "./tax-estimate"

describe("estimateTax", () => {
  it("returns fixed DAS for MEI", () => {
    const result = estimateTax("1", 10000)
    expect(result.regime).toBe("MEI")
    expect(result.totalTax).toBe(75.90)
    expect(result.breakdown).toHaveLength(1)
    expect(result.breakdown[0].name).toBe("DAS (fixo)")
  })

  it("calculates Simples Nacional for small clinic", () => {
    // RBT12 = 120,000 (first bracket: 6%)
    const result = estimateTax("2", 10000, 120_000)
    expect(result.regime).toBe("Simples Nacional")
    expect(result.effectiveRate).toBeCloseTo(0.06, 2)
    expect(result.totalTax).toBeCloseTo(600, 0)
  })

  it("calculates Simples Nacional for medium clinic with deduction", () => {
    // RBT12 = 300,000 (second bracket: 11.2% - deduction 9360)
    // Effective = ((300000 * 0.112) - 9360) / 300000 = 0.0808
    const result = estimateTax("2", 25000, 300_000)
    expect(result.regime).toBe("Simples Nacional")
    expect(result.effectiveRate).toBeCloseTo(0.0808, 3)
    expect(result.totalTax).toBeCloseTo(2020, 0)
  })

  it("calculates Lucro Presumido with all taxes", () => {
    const result = estimateTax("3", 50000, 0, 0.05)
    expect(result.regime).toBe("Lucro Presumido")
    expect(result.breakdown).toHaveLength(5)

    const iss = result.breakdown.find((b) => b.name === "ISS")!
    expect(iss.amount).toBe(2500) // 50000 * 5%

    const pis = result.breakdown.find((b) => b.name === "PIS")!
    expect(pis.amount).toBe(325) // 50000 * 0.65%

    const cofins = result.breakdown.find((b) => b.name === "COFINS")!
    expect(cofins.amount).toBe(1500) // 50000 * 3%

    const irpj = result.breakdown.find((b) => b.name === "IRPJ")!
    expect(irpj.amount).toBe(2400) // 50000 * 4.8%

    const csll = result.breakdown.find((b) => b.name === "CSLL")!
    expect(csll.amount).toBe(1440) // 50000 * 2.88%

    expect(result.totalTax).toBe(8165) // sum
  })

  it("returns zero for zero revenue", () => {
    const result = estimateTax("3", 0)
    expect(result.totalTax).toBe(0)
    expect(result.breakdown).toHaveLength(0)
  })

  it("handles unknown regime", () => {
    const result = estimateTax("99", 10000)
    expect(result.totalTax).toBe(0)
  })
})
