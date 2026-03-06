import { describe, it, expect } from "vitest"
import { CANCELLED_STATUSES, TERMINAL_STATUSES } from "./constants"

describe("CANCELLED_STATUSES", () => {
  it("contains all three cancellation statuses", () => {
    expect(CANCELLED_STATUSES).toContain("CANCELADO_ACORDADO")
    expect(CANCELLED_STATUSES).toContain("CANCELADO_FALTA")
    expect(CANCELLED_STATUSES).toContain("CANCELADO_PROFISSIONAL")
  })

  it("does not contain non-cancel statuses", () => {
    expect(CANCELLED_STATUSES).not.toContain("AGENDADO")
    expect(CANCELLED_STATUSES).not.toContain("CONFIRMADO")
    expect(CANCELLED_STATUSES).not.toContain("FINALIZADO")
  })

  it("has exactly 3 entries", () => {
    expect(CANCELLED_STATUSES).toHaveLength(3)
  })
})

describe("TERMINAL_STATUSES", () => {
  it("contains all cancelled statuses plus FINALIZADO", () => {
    for (const status of CANCELLED_STATUSES) {
      expect(TERMINAL_STATUSES).toContain(status)
    }
    expect(TERMINAL_STATUSES).toContain("FINALIZADO")
  })

  it("does not contain active statuses", () => {
    expect(TERMINAL_STATUSES).not.toContain("AGENDADO")
    expect(TERMINAL_STATUSES).not.toContain("CONFIRMADO")
  })

  it("has exactly 4 entries", () => {
    expect(TERMINAL_STATUSES).toHaveLength(4)
  })
})
