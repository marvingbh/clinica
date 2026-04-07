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
    expect(result).toContain("02, 12, 19 e 26 de março de 2026")
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
    expect(result).toContain("02, 12 e 26 de março de 2026")
  })

  it("limits dates to billed sessions when credits reduce total", () => {
    const result = buildNfseDescription({
      ...baseData,
      referenceMonth: 4,
      referenceYear: 2026,
      sessionDates: [date("2026-04-10"), date("2026-04-16"), date("2026-04-17"), date("2026-04-24")],
      sessionFee: 510,
      totalAmount: 1020, // 2 sessions billed (4 sessions - 2 credits)
    })
    // Should only show the 2 oldest dates
    expect(result).toContain("10 e 16 de abril de 2026")
    expect(result).not.toContain("17")
    expect(result).not.toContain("24")
  })

  it("shows all dates when no credits", () => {
    const result = buildNfseDescription({
      ...baseData,
      sessionDates: [date("2026-03-05"), date("2026-03-12")],
      sessionFee: 540,
      totalAmount: 1080, // matches all sessions
    })
    expect(result).toContain("05 e 12 de março de 2026")
  })

  it("formats cross-month dates correctly (same year)", () => {
    const result = buildNfseDescription({
      ...baseData,
      referenceMonth: 4,
      referenceYear: 2026,
      sessionDates: [date("2026-03-14"), date("2026-03-23"), date("2026-04-07"), date("2026-04-21"), date("2026-04-28")],
    })
    expect(result).toContain("14 e 23 de março e 07, 21 e 28 de abril de 2026")
  })

  it("formats cross-year dates with both years shown", () => {
    const result = buildNfseDescription({
      ...baseData,
      referenceMonth: 1,
      referenceYear: 2026,
      sessionDates: [date("2025-12-15"), date("2025-12-22"), date("2026-01-05"), date("2026-01-12")],
    })
    expect(result).toContain("15 e 22 de dezembro de 2025 e 05 e 12 de janeiro de 2026")
  })

  it("formats cross-year with multiple dates in each year", () => {
    const result = buildNfseDescription({
      ...baseData,
      referenceMonth: 1,
      referenceYear: 2026,
      sessionDates: [date("2025-12-08"), date("2025-12-15"), date("2025-12-22"), date("2026-01-05"), date("2026-01-12"), date("2026-01-19")],
    })
    expect(result).toContain("08, 15 e 22 de dezembro de 2025 e 05, 12 e 19 de janeiro de 2026")
  })

  it("formats single cross-year date per month", () => {
    const result = buildNfseDescription({
      ...baseData,
      referenceMonth: 1,
      referenceYear: 2026,
      sessionDates: [date("2025-12-29"), date("2026-01-05")],
    })
    expect(result).toContain("29 de dezembro de 2025 e 5 de janeiro de 2026")
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
