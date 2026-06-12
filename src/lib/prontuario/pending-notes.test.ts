import { describe, it, expect } from "vitest"
import {
  resolveNoteOwnerProfessional,
  filterPendingAppointments,
  buildPendingTodoInput,
} from "./pending-notes"
import type { PendingAppointment } from "./types"

const NOW = new Date("2026-06-11T12:00:00.000Z")

function appt(overrides: Partial<PendingAppointment>): PendingAppointment {
  return {
    id: "a1",
    patientId: "p1",
    patientName: "João",
    scheduledAt: new Date("2026-06-09T15:00:00.000Z"), // 2 days ago
    status: "FINALIZADO",
    type: "CONSULTA",
    professionalProfileId: "prof1",
    attendingProfessionalId: null,
    ...overrides,
  }
}

describe("resolveNoteOwnerProfessional", () => {
  it("prefers the attending professional", () => {
    expect(
      resolveNoteOwnerProfessional(appt({ attendingProfessionalId: "att1" }))
    ).toBe("att1")
  })

  it("falls back to the owner professional", () => {
    expect(resolveNoteOwnerProfessional(appt({ attendingProfessionalId: null }))).toBe("prof1")
  })
})

describe("filterPendingAppointments", () => {
  const empty = new Set<string>()

  it("includes a FINALIZADO CONSULTA >24h old without a note", () => {
    expect(filterPendingAppointments([appt({})], empty, NOW)).toHaveLength(1)
  })

  it("excludes when a note already exists", () => {
    expect(filterPendingAppointments([appt({})], new Set(["a1"]), NOW)).toHaveLength(0)
  })

  it("excludes sessions less than 24h ago", () => {
    const recent = appt({ scheduledAt: new Date("2026-06-11T06:00:00.000Z") }) // 6h ago
    expect(filterPendingAppointments([recent], empty, NOW)).toHaveLength(0)
  })

  it("excludes non-FINALIZADO statuses", () => {
    expect(filterPendingAppointments([appt({ status: "AGENDADO" })], empty, NOW)).toHaveLength(0)
    expect(
      filterPendingAppointments([appt({ status: "CANCELADO_FALTA" })], empty, NOW)
    ).toHaveLength(0)
  })

  it("excludes non-CONSULTA types", () => {
    expect(filterPendingAppointments([appt({ type: "REUNIAO" })], empty, NOW)).toHaveLength(0)
  })

  it("excludes appointments without a patient (gotcha)", () => {
    expect(
      filterPendingAppointments([appt({ patientId: null })], empty, NOW)
    ).toHaveLength(0)
  })

  it("excludes sessions outside the 14-day lookback window", () => {
    const old = appt({ scheduledAt: new Date("2026-05-20T15:00:00.000Z") }) // ~22 days
    expect(filterPendingAppointments([old], empty, NOW)).toHaveLength(0)
  })

  it("with ownerProfessionalId, excludes sessions a colleague attended", () => {
    // Caller (prof1) is the booking owner, but a colleague attended -> the note
    // belongs to the colleague, not the caller.
    const attendedByColleague = appt({
      professionalProfileId: "prof1",
      attendingProfessionalId: "colega",
    })
    expect(
      filterPendingAppointments([attendedByColleague], empty, NOW, {
        ownerProfessionalId: "prof1",
      })
    ).toHaveLength(0)
  })

  it("with ownerProfessionalId, includes sessions the caller attended", () => {
    const attendedBySelf = appt({
      professionalProfileId: "other",
      attendingProfessionalId: "prof1",
    })
    expect(
      filterPendingAppointments([attendedBySelf], empty, NOW, {
        ownerProfessionalId: "prof1",
      })
    ).toHaveLength(1)
  })
})

describe("buildPendingTodoInput", () => {
  it("builds the title, day and source appointment", () => {
    const input = buildPendingTodoInput(appt({}), "2026-06-11")
    expect(input.title).toBe("Registrar evolução — João")
    expect(input.day).toBe("2026-06-11")
    expect(input.sourceAppointmentId).toBe("a1")
    expect(input.professionalProfileId).toBe("prof1")
  })

  it("falls back to 'Paciente' when name is null", () => {
    const input = buildPendingTodoInput(appt({ patientName: null }), "2026-06-11")
    expect(input.title).toBe("Registrar evolução — Paciente")
  })
})
