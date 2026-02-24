import { describe, it, expect } from "vitest"
import {
  isValidTransition,
  computeStatusUpdateData,
  shouldUpdateLastVisitAt,
  VALID_TRANSITIONS,
  STATUS_LABELS,
} from "./status-transitions"

describe("isValidTransition", () => {
  it("allows AGENDADO → CONFIRMADO", () => {
    expect(isValidTransition("AGENDADO", "CONFIRMADO")).toBe(true)
  })

  it("allows AGENDADO → FINALIZADO", () => {
    expect(isValidTransition("AGENDADO", "FINALIZADO")).toBe(true)
  })

  it("allows AGENDADO → all cancel types", () => {
    expect(isValidTransition("AGENDADO", "CANCELADO_FALTA")).toBe(true)
    expect(isValidTransition("AGENDADO", "CANCELADO_PROFISSIONAL")).toBe(true)
    expect(isValidTransition("AGENDADO", "CANCELADO_ACORDADO")).toBe(true)
  })

  it("allows CONFIRMADO → FINALIZADO", () => {
    expect(isValidTransition("CONFIRMADO", "FINALIZADO")).toBe(true)
  })

  it("allows CONFIRMADO → all cancel types", () => {
    expect(isValidTransition("CONFIRMADO", "CANCELADO_FALTA")).toBe(true)
    expect(isValidTransition("CONFIRMADO", "CANCELADO_PROFISSIONAL")).toBe(true)
    expect(isValidTransition("CONFIRMADO", "CANCELADO_ACORDADO")).toBe(true)
  })

  it("blocks transitions from FINALIZADO (terminal)", () => {
    expect(isValidTransition("FINALIZADO", "AGENDADO")).toBe(false)
    expect(isValidTransition("FINALIZADO", "CONFIRMADO")).toBe(false)
    expect(isValidTransition("FINALIZADO", "CANCELADO_FALTA")).toBe(false)
  })

  it("blocks transitions from CANCELADO_PROFISSIONAL (terminal)", () => {
    expect(isValidTransition("CANCELADO_PROFISSIONAL", "AGENDADO")).toBe(false)
    expect(isValidTransition("CANCELADO_PROFISSIONAL", "FINALIZADO")).toBe(false)
  })

  it("allows CANCELADO_ACORDADO → CANCELADO_FALTA", () => {
    expect(isValidTransition("CANCELADO_ACORDADO", "CANCELADO_FALTA")).toBe(true)
  })

  it("blocks CANCELADO_ACORDADO → anything else", () => {
    expect(isValidTransition("CANCELADO_ACORDADO", "AGENDADO")).toBe(false)
    expect(isValidTransition("CANCELADO_ACORDADO", "FINALIZADO")).toBe(false)
  })

  it("allows CANCELADO_FALTA → CANCELADO_ACORDADO", () => {
    expect(isValidTransition("CANCELADO_FALTA", "CANCELADO_ACORDADO")).toBe(true)
  })

  it("blocks CANCELADO_FALTA → anything else", () => {
    expect(isValidTransition("CANCELADO_FALTA", "AGENDADO")).toBe(false)
    expect(isValidTransition("CANCELADO_FALTA", "FINALIZADO")).toBe(false)
  })

  it("returns false for unknown status", () => {
    expect(isValidTransition("UNKNOWN", "CONFIRMADO")).toBe(false)
  })
})

describe("computeStatusUpdateData", () => {
  const now = new Date("2026-02-24T10:00:00Z")

  it("sets confirmedAt when transitioning to CONFIRMADO", () => {
    const result = computeStatusUpdateData("CONFIRMADO", now)
    expect(result).toEqual({ status: "CONFIRMADO", confirmedAt: now })
  })

  it("sets cancelledAt for CANCELADO_PROFISSIONAL", () => {
    const result = computeStatusUpdateData("CANCELADO_PROFISSIONAL", now)
    expect(result).toEqual({ status: "CANCELADO_PROFISSIONAL", cancelledAt: now })
  })

  it("sets cancelledAt for CANCELADO_ACORDADO", () => {
    const result = computeStatusUpdateData("CANCELADO_ACORDADO", now)
    expect(result).toEqual({ status: "CANCELADO_ACORDADO", cancelledAt: now })
  })

  it("sets cancelledAt for CANCELADO_FALTA", () => {
    const result = computeStatusUpdateData("CANCELADO_FALTA", now)
    expect(result).toEqual({ status: "CANCELADO_FALTA", cancelledAt: now })
  })

  it("sets only status for FINALIZADO (no extra timestamp)", () => {
    const result = computeStatusUpdateData("FINALIZADO", now)
    expect(result).toEqual({ status: "FINALIZADO" })
  })

  it("sets only status for AGENDADO", () => {
    const result = computeStatusUpdateData("AGENDADO", now)
    expect(result).toEqual({ status: "AGENDADO" })
  })
})

describe("shouldUpdateLastVisitAt", () => {
  it("returns true for FINALIZADO", () => {
    expect(shouldUpdateLastVisitAt("FINALIZADO")).toBe(true)
  })

  it("returns false for AGENDADO", () => {
    expect(shouldUpdateLastVisitAt("AGENDADO")).toBe(false)
  })

  it("returns false for CONFIRMADO", () => {
    expect(shouldUpdateLastVisitAt("CONFIRMADO")).toBe(false)
  })

  it("returns false for all cancel statuses", () => {
    expect(shouldUpdateLastVisitAt("CANCELADO_ACORDADO")).toBe(false)
    expect(shouldUpdateLastVisitAt("CANCELADO_FALTA")).toBe(false)
    expect(shouldUpdateLastVisitAt("CANCELADO_PROFISSIONAL")).toBe(false)
  })
})

describe("VALID_TRANSITIONS", () => {
  it("FINALIZADO is a terminal state with no transitions", () => {
    expect(VALID_TRANSITIONS.FINALIZADO).toEqual([])
  })

  it("CANCELADO_PROFISSIONAL is a terminal state", () => {
    expect(VALID_TRANSITIONS.CANCELADO_PROFISSIONAL).toEqual([])
  })
})

describe("STATUS_LABELS", () => {
  it("has labels for all statuses", () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(6)
    expect(STATUS_LABELS.AGENDADO).toBe("Agendado")
    expect(STATUS_LABELS.FINALIZADO).toBe("Finalizado")
  })
})
