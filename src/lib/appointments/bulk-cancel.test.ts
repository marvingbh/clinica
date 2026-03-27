import { describe, it, expect } from "vitest"
import {
  filterCancellableAppointments,
  buildBulkCancelSummary,
  validateDateRange,
  validateReason,
  normalizeDateRange,
  findRecurrencesToDeactivate,
  type BulkCancelAppointment,
} from "./bulk-cancel"

function makeAppointment(
  overrides: Partial<BulkCancelAppointment> = {}
): BulkCancelAppointment {
  return {
    id: overrides.id ?? "apt-1",
    status: overrides.status ?? "AGENDADO",
    type: overrides.type ?? "CONSULTA",
    scheduledAt: overrides.scheduledAt ?? new Date("2026-04-01T10:00:00"),
    recurrenceId: overrides.recurrenceId ?? null,
    patientId: overrides.patientId ?? "pat-1",
    professionalProfileId: overrides.professionalProfileId ?? "prof-1",
    patient: overrides.patient !== undefined ? overrides.patient : { id: "pat-1", name: "Maria Silva" },
    professionalName: overrides.professionalName ?? "Dr. João",
  }
}

describe("filterCancellableAppointments", () => {
  it("includes CONSULTA with AGENDADO status", () => {
    const apts = [makeAppointment({ type: "CONSULTA", status: "AGENDADO" })]
    expect(filterCancellableAppointments(apts)).toHaveLength(1)
  })

  it("includes REUNIAO with CONFIRMADO status", () => {
    const apts = [makeAppointment({ type: "REUNIAO", status: "CONFIRMADO" })]
    expect(filterCancellableAppointments(apts)).toHaveLength(1)
  })

  it("excludes TAREFA, LEMBRETE, NOTA types", () => {
    const apts = [
      makeAppointment({ type: "TAREFA", status: "AGENDADO" }),
      makeAppointment({ type: "LEMBRETE", status: "AGENDADO" }),
      makeAppointment({ type: "NOTA", status: "AGENDADO" }),
    ]
    expect(filterCancellableAppointments(apts)).toHaveLength(0)
  })

  it("excludes already cancelled and finalized appointments", () => {
    const apts = [
      makeAppointment({ status: "CANCELADO_PROFISSIONAL" }),
      makeAppointment({ status: "CANCELADO_ACORDADO" }),
      makeAppointment({ status: "CANCELADO_FALTA" }),
      makeAppointment({ status: "FINALIZADO" }),
    ]
    expect(filterCancellableAppointments(apts)).toHaveLength(0)
  })

  it("filters mixed list correctly", () => {
    const apts = [
      makeAppointment({ id: "1", type: "CONSULTA", status: "AGENDADO" }),
      makeAppointment({ id: "2", type: "TAREFA", status: "AGENDADO" }),
      makeAppointment({ id: "3", type: "REUNIAO", status: "CONFIRMADO" }),
      makeAppointment({ id: "4", type: "CONSULTA", status: "FINALIZADO" }),
    ]
    const result = filterCancellableAppointments(apts)
    expect(result).toHaveLength(2)
    expect(result.map((a) => a.id)).toEqual(["1", "3"])
  })
})

describe("buildBulkCancelSummary", () => {
  it("counts appointments by type", () => {
    const apts = [
      makeAppointment({ type: "CONSULTA" }),
      makeAppointment({ type: "CONSULTA" }),
      makeAppointment({ type: "REUNIAO" }),
    ]
    const summary = buildBulkCancelSummary(apts)
    expect(summary.total).toBe(3)
    expect(summary.byType).toEqual({ CONSULTA: 2, REUNIAO: 1 })
  })

  it("deduplicates patients and sorts by name", () => {
    const apts = [
      makeAppointment({ id: "1", patient: { id: "p1", name: "Zara" } }),
      makeAppointment({ id: "2", patient: { id: "p2", name: "Ana" } }),
      makeAppointment({ id: "3", patient: { id: "p1", name: "Zara" } }), // duplicate
    ]
    const summary = buildBulkCancelSummary(apts)
    expect(summary.patients).toEqual([
      { id: "p2", name: "Ana" },
      { id: "p1", name: "Zara" },
    ])
  })

  it("handles appointments without patients (REUNIAO)", () => {
    const apts = [
      makeAppointment({ patient: null, patientId: null, type: "REUNIAO" }),
    ]
    const summary = buildBulkCancelSummary(apts)
    expect(summary.patients).toEqual([])
    expect(summary.total).toBe(1)
  })

  it("returns empty summary for empty list", () => {
    const summary = buildBulkCancelSummary([])
    expect(summary).toEqual({ total: 0, byType: {}, patients: [] })
  })
})

describe("validateDateRange", () => {
  it("accepts valid same-day range", () => {
    expect(validateDateRange("2026-04-01", "2026-04-01")).toEqual({ valid: true })
  })

  it("accepts valid multi-day range", () => {
    expect(validateDateRange("2026-04-01", "2026-04-15")).toEqual({ valid: true })
  })

  it("accepts inverted range (auto-swaps)", () => {
    expect(validateDateRange("2026-04-15", "2026-04-01")).toEqual({ valid: true })
  })

  it("rejects range exceeding 90 days", () => {
    const result = validateDateRange("2026-01-01", "2026-06-01")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("90")
  })

  it("accepts exactly 90 days", () => {
    expect(validateDateRange("2026-01-01", "2026-04-01")).toEqual({ valid: true })
  })

  it("rejects invalid date format", () => {
    const result = validateDateRange("01/04/2026", "15/04/2026")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("formato")
  })

  it("rejects invalid dates", () => {
    const result = validateDateRange("2026-13-01", "2026-04-01")
    expect(result.valid).toBe(false)
  })
})

describe("validateReason", () => {
  it("accepts valid reason", () => {
    expect(validateReason("Feriado nacional")).toEqual({ valid: true })
  })

  it("rejects too short reason", () => {
    const result = validateReason("ab")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("3")
  })

  it("rejects empty reason", () => {
    expect(validateReason("").valid).toBe(false)
  })

  it("trims whitespace before validating", () => {
    expect(validateReason("   ab   ").valid).toBe(false)
    expect(validateReason("   abc   ").valid).toBe(true)
  })
})

describe("normalizeDateRange", () => {
  it("returns same order when start <= end", () => {
    expect(normalizeDateRange("2026-04-01", "2026-04-15")).toEqual([
      "2026-04-01",
      "2026-04-15",
    ])
  })

  it("swaps when start > end", () => {
    expect(normalizeDateRange("2026-04-15", "2026-04-01")).toEqual([
      "2026-04-01",
      "2026-04-15",
    ])
  })

  it("handles same date", () => {
    expect(normalizeDateRange("2026-04-01", "2026-04-01")).toEqual([
      "2026-04-01",
      "2026-04-01",
    ])
  })
})

describe("findRecurrencesToDeactivate", () => {
  it("returns recurrence when all active appointments are cancelled", () => {
    const cancelledIds = new Set(["apt-1", "apt-2"])
    const recurrenceAppointments = [
      { id: "apt-1", recurrenceId: "rec-1", status: "AGENDADO" },
      { id: "apt-2", recurrenceId: "rec-1", status: "CONFIRMADO" },
      { id: "apt-3", recurrenceId: "rec-1", status: "FINALIZADO" }, // already done, doesn't count
    ]
    expect(findRecurrencesToDeactivate(cancelledIds, recurrenceAppointments)).toEqual(["rec-1"])
  })

  it("does not return recurrence when some active appointments remain", () => {
    const cancelledIds = new Set(["apt-1"])
    const recurrenceAppointments = [
      { id: "apt-1", recurrenceId: "rec-1", status: "AGENDADO" },
      { id: "apt-2", recurrenceId: "rec-1", status: "AGENDADO" }, // not being cancelled
    ]
    expect(findRecurrencesToDeactivate(cancelledIds, recurrenceAppointments)).toEqual([])
  })

  it("handles multiple recurrences", () => {
    const cancelledIds = new Set(["apt-1", "apt-2", "apt-3"])
    const recurrenceAppointments = [
      { id: "apt-1", recurrenceId: "rec-1", status: "AGENDADO" },
      { id: "apt-2", recurrenceId: "rec-1", status: "CONFIRMADO" },
      { id: "apt-3", recurrenceId: "rec-2", status: "AGENDADO" },
      { id: "apt-4", recurrenceId: "rec-2", status: "AGENDADO" }, // not cancelled
    ]
    expect(findRecurrencesToDeactivate(cancelledIds, recurrenceAppointments)).toEqual(["rec-1"])
  })

  it("returns empty array when no recurrence appointments", () => {
    expect(findRecurrencesToDeactivate(new Set(["apt-1"]), [])).toEqual([])
  })

  it("ignores recurrences with only already-cancelled appointments", () => {
    const cancelledIds = new Set(["apt-1"])
    const recurrenceAppointments = [
      { id: "apt-1", recurrenceId: "rec-1", status: "CANCELADO_PROFISSIONAL" },
      { id: "apt-2", recurrenceId: "rec-1", status: "CANCELADO_ACORDADO" },
    ]
    // No active appointments to cancel, so nothing to deactivate
    expect(findRecurrencesToDeactivate(cancelledIds, recurrenceAppointments)).toEqual([])
  })
})
