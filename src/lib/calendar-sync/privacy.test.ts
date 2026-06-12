import { describe, it, expect } from "vitest"
import { firstNameOnly, buildEventTitle } from "./privacy"
import type { SyncSnapshot } from "./types"

function snap(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    id: "a1",
    clinicId: "c1",
    type: "CONSULTA",
    status: "AGENDADO",
    scheduledAt: new Date("2026-06-15T13:00:00Z"),
    endAt: new Date("2026-06-15T13:50:00Z"),
    title: null,
    patientName: "Maria Aparecida Silva",
    clinicName: "Clínica Bem-Estar",
    timezone: "America/Sao_Paulo",
    ...overrides,
  }
}

describe("firstNameOnly", () => {
  it("returns the first token of a composite name", () => {
    expect(firstNameOnly("Maria Aparecida Silva")).toBe("Maria")
  })

  it("collapses leading/extra whitespace", () => {
    expect(firstNameOnly("  João   Pedro ")).toBe("João")
  })

  it("returns empty string for blank input", () => {
    expect(firstNameOnly("")).toBe("")
    expect(firstNameOnly("   ")).toBe("")
  })

  it("returns the whole single-token name", () => {
    expect(firstNameOnly("Ana")).toBe("Ana")
  })
})

describe("buildEventTitle — TOTAL mode", () => {
  it("CONSULTA shows clinic name, never patient", () => {
    const title = buildEventTitle(snap(), "TOTAL")
    expect(title).toBe("Atendimento — Clínica Bem-Estar")
    expect(title).not.toContain("Maria")
  })

  it("TAREFA uses staff title when present", () => {
    expect(buildEventTitle(snap({ type: "TAREFA", title: "Revisar prontuários" }), "TOTAL")).toBe(
      "Revisar prontuários"
    )
  })

  it("REUNIAO falls back to label + clinic when no title", () => {
    expect(buildEventTitle(snap({ type: "REUNIAO", title: null }), "TOTAL")).toBe(
      "Reunião — Clínica Bem-Estar"
    )
  })

  it("LEMBRETE and NOTA fall back to label + clinic", () => {
    expect(buildEventTitle(snap({ type: "LEMBRETE", title: null }), "TOTAL")).toBe(
      "Lembrete — Clínica Bem-Estar"
    )
    expect(buildEventTitle(snap({ type: "NOTA", title: null }), "TOTAL")).toBe(
      "Nota — Clínica Bem-Estar"
    )
  })
})

describe("buildEventTitle — PRIMEIRO_NOME mode", () => {
  it("CONSULTA shows only the patient's first name", () => {
    expect(buildEventTitle(snap(), "PRIMEIRO_NOME")).toBe("Atendimento — Maria")
  })

  it("falls back to TOTAL when patientName is null (nullable patient gotcha)", () => {
    const title = buildEventTitle(snap({ patientName: null }), "PRIMEIRO_NOME")
    expect(title).toBe("Atendimento — Clínica Bem-Estar")
  })

  it("falls back to TOTAL when patientName is blank", () => {
    expect(buildEventTitle(snap({ patientName: "   " }), "PRIMEIRO_NOME")).toBe(
      "Atendimento — Clínica Bem-Estar"
    )
  })
})

describe("buildEventTitle — PII never leaks", () => {
  it("does not include phone or notes-like values even if injected into patientName", () => {
    // Even if a name field somehow carried extra tokens, only the first token is used.
    const title = buildEventTitle(
      snap({ patientName: "Maria 11999998888 cpf12345678900" }),
      "PRIMEIRO_NOME"
    )
    expect(title).toBe("Atendimento — Maria")
    expect(title).not.toContain("11999998888")
    expect(title).not.toContain("12345678900")
  })
})
