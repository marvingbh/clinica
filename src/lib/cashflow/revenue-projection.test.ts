import { describe, it, expect } from "vitest"
import { calculateCancellationRate, projectRevenue } from "./revenue-projection"

describe("calculateCancellationRate", () => {
  it("returns 0 for no appointments", () => {
    expect(calculateCancellationRate([])).toBe(0)
  })

  it("returns 0 when no cancellations", () => {
    const apts = [
      { status: "FINALIZADO", type: "CONSULTA" },
      { status: "CONFIRMADO", type: "CONSULTA" },
    ]
    expect(calculateCancellationRate(apts)).toBe(0)
  })

  it("calculates rate correctly", () => {
    const apts = [
      { status: "FINALIZADO", type: "CONSULTA" },
      { status: "FINALIZADO", type: "CONSULTA" },
      { status: "FINALIZADO", type: "CONSULTA" },
      { status: "CANCELADO_FALTA", type: "CONSULTA" },
    ]
    expect(calculateCancellationRate(apts)).toBe(0.25)
  })

  it("ignores non-CONSULTA types", () => {
    const apts = [
      { status: "FINALIZADO", type: "CONSULTA" },
      { status: "CANCELADO_FALTA", type: "TAREFA" }, // ignored
    ]
    expect(calculateCancellationRate(apts)).toBe(0)
  })
})

describe("projectRevenue", () => {
  const baseApt = {
    scheduledAt: new Date(2026, 3, 10),
    price: null,
    type: "CONSULTA",
    status: "AGENDADO",
    patientId: "patient-1",
    professionalProfileId: "prof-1",
    attendingProfessionalId: null,
    groupId: null,
    sessionGroupId: null,
  }

  const patientFees = new Map([["patient-1", 200], ["patient-2", 300]])
  const professionals = new Map([
    ["prof-1", { id: "prof-1", repassePercentage: 60 }],
  ])

  it("projects revenue from appointments × session fee", () => {
    const apts = [
      { id: "a1", ...baseApt },
      { id: "a2", ...baseApt },
      { id: "a3", ...baseApt, patientId: "patient-2" },
    ]

    const result = projectRevenue(apts, patientFees, professionals, 0, 0)
    expect(result.totalAppointments).toBe(3)
    expect(result.grossRevenue).toBe(700) // 200 + 200 + 300
    expect(result.projectedRevenue).toBe(700) // no cancellation discount
  })

  it("applies cancellation rate discount", () => {
    const apts = [{ id: "a1", ...baseApt }]
    const result = projectRevenue(apts, patientFees, professionals, 0.2, 0)
    expect(result.projectedRevenue).toBe(160) // 200 * 0.8
  })

  it("estimates repasse per professional", () => {
    const apts = [{ id: "a1", ...baseApt }]
    // Revenue: 200, cancellation: 10%, tax: 10%, repasse: 60%
    const result = projectRevenue(apts, patientFees, professionals, 0.1, 10)
    // Projected: 200 * 0.9 = 180
    // After tax: 180 * 0.9 = 162
    // Repasse: 162 * 0.6 = 97.20
    expect(result.projectedRevenue).toBe(180)
    expect(result.totalEstimatedRepasse).toBe(97.2)
  })

  it("uses appointment price override over patient fee", () => {
    const apts = [{ id: "a1", ...baseApt, price: 350 }]
    const result = projectRevenue(apts, patientFees, professionals, 0, 0)
    expect(result.grossRevenue).toBe(350)
  })

  it("excludes non-billable types and statuses", () => {
    const apts = [
      { id: "a1", ...baseApt, type: "TAREFA" }, // not billable type
      { id: "a2", ...baseApt, status: "CANCELADO_ACORDADO" }, // not billable status
      { id: "a3", ...baseApt }, // billable
    ]
    const result = projectRevenue(apts, patientFees, professionals, 0, 0)
    expect(result.totalAppointments).toBe(1)
  })

  it("includes REUNIAO type", () => {
    const apts = [{ id: "a1", ...baseApt, type: "REUNIAO" }]
    const result = projectRevenue(apts, patientFees, professionals, 0, 0)
    expect(result.totalAppointments).toBe(1)
  })
})
