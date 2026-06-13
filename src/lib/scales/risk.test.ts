import { describe, it, expect } from "vitest"
import {
  DEFAULT_RISK_PATIENT_MESSAGE,
  resolveRiskPatientMessage,
  buildRiskTodoTitle,
  buildRiskAlertEmail,
} from "./risk"

describe("DEFAULT_RISK_PATIENT_MESSAGE", () => {
  it("mentions the CVV and 188", () => {
    expect(DEFAULT_RISK_PATIENT_MESSAGE).toContain("CVV")
    expect(DEFAULT_RISK_PATIENT_MESSAGE).toContain("188")
  })
})

describe("resolveRiskPatientMessage", () => {
  it("uses the clinic override when present and non-empty", () => {
    expect(resolveRiskPatientMessage("Fale com a recepção.")).toBe("Fale com a recepção.")
  })

  it("falls back to the default when null", () => {
    expect(resolveRiskPatientMessage(null)).toBe(DEFAULT_RISK_PATIENT_MESSAGE)
  })

  it("falls back to the default for a blank/whitespace override", () => {
    expect(resolveRiskPatientMessage("   ")).toBe(DEFAULT_RISK_PATIENT_MESSAGE)
  })
})

describe("buildRiskTodoTitle", () => {
  it("interpolates the patient name with the warning prefix", () => {
    expect(buildRiskTodoTitle("Ana Souza")).toBe("⚠ Resposta de risco — Ana Souza")
  })
})

describe("buildRiskAlertEmail", () => {
  const email = buildRiskAlertEmail({
    patientName: "Ana Souza",
    scaleShortName: "PHQ-9",
    completedAt: new Date("2026-06-12T17:30:00Z"), // 14:30 BRT
  })

  it("subject carries the warning + patient name", () => {
    expect(email.subject).toBe("⚠ Resposta de risco — Ana Souza")
  })

  it("body contains a pt-BR date DD/MM/YYYY and time HH:mm (BRT)", () => {
    expect(email.content).toMatch(/12\/06\/2026/)
    expect(email.content).toMatch(/14:30/)
  })

  it("body does NOT contain any score or answer content", () => {
    expect(email.content).not.toMatch(/pontua|score|\bresposta[s]? [0-9]/i)
    // no bare numbers that could be a score (only the date/time)
    expect(email.content).toContain("Acesse o sistema")
    expect(email.content).toContain("não substitui acompanhamento de emergência")
  })
})
