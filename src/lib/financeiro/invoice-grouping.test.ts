import { describe, it, expect } from "vitest"
import { resolveGrouping, isGroupingAllowed, deriveGroupStatus } from "./invoice-grouping"

describe("resolveGrouping", () => {
  it("returns patient override when set", () => {
    expect(resolveGrouping("MONTHLY", "PER_SESSION")).toBe("PER_SESSION")
    expect(resolveGrouping("PER_SESSION", "MONTHLY")).toBe("MONTHLY")
  })

  it("falls back to clinic default when patient is null", () => {
    expect(resolveGrouping("PER_SESSION", null)).toBe("PER_SESSION")
    expect(resolveGrouping("MONTHLY", null)).toBe("MONTHLY")
  })
})

describe("isGroupingAllowed", () => {
  it("allows PER_SESSION grouping with PER_SESSION billing", () => {
    expect(isGroupingAllowed("PER_SESSION", "PER_SESSION")).toBe(true)
  })

  it("rejects PER_SESSION grouping with MONTHLY_FIXED billing", () => {
    expect(isGroupingAllowed("MONTHLY_FIXED", "PER_SESSION")).toBe(false)
  })

  it("allows MONTHLY grouping with any billing mode", () => {
    expect(isGroupingAllowed("PER_SESSION", "MONTHLY")).toBe(true)
    expect(isGroupingAllowed("MONTHLY_FIXED", "MONTHLY")).toBe(true)
  })
})

describe("deriveGroupStatus", () => {
  it("returns PAGO when all are PAGO", () => {
    expect(deriveGroupStatus(["PAGO", "PAGO", "PAGO"])).toBe("PAGO")
  })

  it("returns CANCELADO when all are CANCELADO", () => {
    expect(deriveGroupStatus(["CANCELADO", "CANCELADO"])).toBe("CANCELADO")
  })

  it("returns PARCIAL when mixed paid/unpaid", () => {
    expect(deriveGroupStatus(["PAGO", "PENDENTE"])).toBe("PARCIAL")
  })

  it("returns PENDENTE when all PENDENTE", () => {
    expect(deriveGroupStatus(["PENDENTE", "PENDENTE"])).toBe("PENDENTE")
  })

  it("returns ENVIADO when all ENVIADO", () => {
    expect(deriveGroupStatus(["ENVIADO", "ENVIADO"])).toBe("ENVIADO")
  })

  it("ignores CANCELADO in mixed statuses", () => {
    expect(deriveGroupStatus(["PAGO", "CANCELADO"])).toBe("PAGO")
    expect(deriveGroupStatus(["PENDENTE", "CANCELADO"])).toBe("PENDENTE")
  })

  it("returns CANCELADO for empty list", () => {
    expect(deriveGroupStatus([])).toBe("CANCELADO")
  })

  it("returns PARCIAL for mixed ENVIADO and PAGO", () => {
    expect(deriveGroupStatus(["ENVIADO", "PAGO"])).toBe("PARCIAL")
  })
})
