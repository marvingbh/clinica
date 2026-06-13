import { describe, it, expect } from "vitest"
import { effectiveStatus, FORM_STATUS_LABELS } from "./status"

const now = new Date("2026-06-12T12:00:00Z")
const past = new Date("2026-06-01T12:00:00Z")
const future = new Date("2026-07-01T12:00:00Z")

describe("effectiveStatus", () => {
  it("ENVIADO not expired stays ENVIADO", () => {
    expect(effectiveStatus({ status: "ENVIADO", expiresAt: future }, now)).toBe("ENVIADO")
  })

  it("ENVIADO past expiry → EXPIRADO", () => {
    expect(effectiveStatus({ status: "ENVIADO", expiresAt: past }, now)).toBe("EXPIRADO")
  })

  it("EM_PREENCHIMENTO past expiry → EXPIRADO", () => {
    expect(effectiveStatus({ status: "EM_PREENCHIMENTO", expiresAt: past }, now)).toBe("EXPIRADO")
  })

  it("CONCLUIDO never expires", () => {
    expect(effectiveStatus({ status: "CONCLUIDO", expiresAt: past }, now)).toBe("CONCLUIDO")
  })

  it("persisted EXPIRADO stays EXPIRADO", () => {
    expect(effectiveStatus({ status: "EXPIRADO", expiresAt: future }, now)).toBe("EXPIRADO")
  })
})

describe("FORM_STATUS_LABELS", () => {
  it("has pt-BR labels for every status", () => {
    expect(FORM_STATUS_LABELS.ENVIADO).toBe("Enviado")
    expect(FORM_STATUS_LABELS.EM_PREENCHIMENTO).toBe("Em preenchimento")
    expect(FORM_STATUS_LABELS.CONCLUIDO).toBe("Concluído")
    expect(FORM_STATUS_LABELS.EXPIRADO).toBe("Expirado")
  })
})
