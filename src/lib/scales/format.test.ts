import { describe, it, expect } from "vitest"
import {
  STATUS_LABELS,
  SOURCE_LABELS,
  PAUSED_REASON_LABELS,
  severityChipColor,
  statusChipColor,
} from "./format"
import { PHQ9_DEFINITION, GAD7_DEFINITION } from "./definitions"

describe("label maps", () => {
  it("status labels (pt-BR)", () => {
    expect(STATUS_LABELS.ENVIADA).toBe("Enviada")
    expect(STATUS_LABELS.CONCLUIDA).toBe("Concluída")
    expect(STATUS_LABELS.EXPIRADA).toBe("Expirada")
  })

  it("source labels (pt-BR)", () => {
    expect(SOURCE_LABELS.LINK_PACIENTE).toBe("Link do paciente")
    expect(SOURCE_LABELS.EM_SESSAO).toBe("Em sessão")
  })

  it("paused-reason labels (pt-BR)", () => {
    expect(PAUSED_REASON_LABELS.SEM_AGENDAMENTOS_FUTUROS).toContain("sem agendamentos")
    expect(PAUSED_REASON_LABELS.SEM_CANAL_CONSENTIDO).toContain("sem canal")
    expect(PAUSED_REASON_LABELS.PROFISSIONAL_INATIVO).toContain("profissional inativo")
  })
})

describe("severityChipColor", () => {
  it("returns a non-empty class for every PHQ-9 band", () => {
    for (const band of PHQ9_DEFINITION.severityBands) {
      expect(severityChipColor(PHQ9_DEFINITION, band.label)).toBe(band.color)
      expect(severityChipColor(PHQ9_DEFINITION, band.label).length).toBeGreaterThan(0)
    }
  })

  it("returns a non-empty class for every GAD-7 band", () => {
    for (const band of GAD7_DEFINITION.severityBands) {
      expect(severityChipColor(GAD7_DEFINITION, band.label)).toBe(band.color)
    }
  })

  it("falls back to a gray chip for an unknown label", () => {
    expect(severityChipColor(PHQ9_DEFINITION, "Nope")).toContain("gray")
  })
})

describe("statusChipColor", () => {
  it("maps each status to a distinct color class", () => {
    expect(statusChipColor("CONCLUIDA")).toContain("emerald")
    expect(statusChipColor("ENVIADA")).toContain("blue")
    expect(statusChipColor("EXPIRADA")).toContain("gray")
  })
})
