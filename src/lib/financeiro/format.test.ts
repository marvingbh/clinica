import { describe, it, expect } from "vitest"
import { getMonthName, formatCurrencyBRL, formatInvoiceReference } from "./format"

describe("getMonthName", () => {
  it("returns Janeiro for month 1", () => { expect(getMonthName(1)).toBe("Janeiro") })
  it("returns Dezembro for month 12", () => { expect(getMonthName(12)).toBe("Dezembro") })
  it("returns Março for month 3", () => { expect(getMonthName(3)).toBe("Março") })
})

describe("formatCurrencyBRL", () => {
  it("formats 150 as R$ 150,00", () => { expect(formatCurrencyBRL(150)).toBe("R$ 150,00") })
  it("formats 1500.50 correctly", () => { expect(formatCurrencyBRL(1500.50)).toBe("R$ 1.500,50") })
  it("formats 0 as R$ 0,00", () => { expect(formatCurrencyBRL(0)).toBe("R$ 0,00") })
  it("formats negative values", () => { expect(formatCurrencyBRL(-150)).toContain("150,00") })
})

describe("formatInvoiceReference", () => {
  it("formats month/year as 'Março/2026'", () => { expect(formatInvoiceReference(3, 2026)).toBe("Março/2026") })
})
