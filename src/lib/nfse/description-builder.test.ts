import { describe, it, expect } from "vitest"
import { buildNfseDescription } from "./description-builder"

// Use noon UTC to avoid timezone day-shift issues
function date(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`)
}

describe("buildNfseDescription", () => {
  const baseData = {
    patientName: "Joao Silva",
    professionalName: "Maria Santos",
    referenceMonth: 3,
    referenceYear: 2026,
    sessionFee: 540,
  }

  it("uses plural form for multiple sessions", () => {
    const result = buildNfseDescription({
      ...baseData,
      sessionDates: [date("2026-03-02"), date("2026-03-12"), date("2026-03-19"), date("2026-03-26")],
    })
    expect(result).toContain("consultas em psicoterapia")
    expect(result).toContain("nos dias 02, 12, 19 e 26")
    expect(result).toContain("Cada sessão com valor unitário de R$ 540,00")
  })

  it("uses singular form for single session", () => {
    const result = buildNfseDescription({
      ...baseData,
      sessionDates: [date("2026-03-05")],
    })
    expect(result).toContain("consulta em psicoterapia")
    expect(result).toContain("no dia 5")
    expect(result).toContain("Valor de R$ 540,00")
    expect(result).not.toContain("nos dias")
    expect(result).not.toContain("consultas")
  })

  it("includes billing responsible relation when set", () => {
    const result = buildNfseDescription({
      ...baseData,
      billingResponsibleName: "Ana Silva",
      sessionDates: [date("2026-03-05")],
    })
    expect(result).toContain("seu(a) filho(a)")
  })

  it("omits relation when no billing responsible", () => {
    const result = buildNfseDescription({
      ...baseData,
      sessionDates: [date("2026-03-05")],
    })
    expect(result).not.toContain("seu(a) filho(a)")
  })

  it("includes registration number when provided", () => {
    const result = buildNfseDescription({
      ...baseData,
      professionalCrp: "CRP23853/4",
      sessionDates: [date("2026-03-05")],
    })
    expect(result).toContain("Maria Santos CRP23853/4")
    expect(result).not.toContain("(CRP23853/4)")
  })

  it("includes tax info when provided", () => {
    const result = buildNfseDescription({
      ...baseData,
      taxPercentage: 15.5,
      sessionDates: [date("2026-03-05")],
    })
    expect(result).toContain("Lei 12.741/2012")
    expect(result).toContain("15.50%")
  })

  it("sorts dates chronologically", () => {
    const result = buildNfseDescription({
      ...baseData,
      sessionDates: [date("2026-03-26"), date("2026-03-02"), date("2026-03-12")],
    })
    expect(result).toContain("nos dias 02, 12 e 26")
  })

  it("handles custom template", () => {
    const result = buildNfseDescription(
      { ...baseData, sessionDates: [date("2026-03-05")] },
      "Servico: {{paciente}} em {{mes}}/{{ano}}"
    )
    expect(result).toBe("Servico: Joao Silva em março/2026")
  })

  it("converts old-style template to singular for single session", () => {
    const oldTemplate = "Referente a consultas em psicoterapia de {{relacao}} {{paciente}}, nos dias {{dias}} de {{mes}} de {{ano}}, pela psicóloga {{profissional}}. Cada sessão com valor unitário de {{valor_sessao}}{{impostos}}"
    const result = buildNfseDescription(
      { ...baseData, sessionDates: [date("2026-03-05")] },
      oldTemplate
    )
    expect(result).toContain("consulta em psicoterapia")
    expect(result).toContain("no dia 5")
    expect(result).toContain("Valor de R$ 540,00")
    expect(result).not.toContain("consultas")
    expect(result).not.toContain("nos dias")
    expect(result).not.toContain("Cada sessão")
  })

  it("keeps old-style template plural for multiple sessions", () => {
    const oldTemplate = "Referente a consultas em psicoterapia de {{relacao}} {{paciente}}, nos dias {{dias}} de {{mes}} de {{ano}}, pela psicóloga {{profissional}}. Cada sessão com valor unitário de {{valor_sessao}}{{impostos}}"
    const result = buildNfseDescription(
      { ...baseData, sessionDates: [date("2026-03-05"), date("2026-03-12")] },
      oldTemplate
    )
    expect(result).toContain("consultas em psicoterapia")
    expect(result).toContain("nos dias 05 e 12")
    expect(result).toContain("Cada sessão com valor unitário de R$ 540,00")
  })
})
