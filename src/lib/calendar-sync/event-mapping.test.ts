import { describe, it, expect } from "vitest"
import { isSyncableType, buildGoogleEventBody, computeSyncHash } from "./event-mapping"
import type { SyncSnapshot, IntegrationPrefs } from "./types"

const prefsOff: IntegrationPrefs = { privacyMode: "TOTAL", syncNonBlocking: false }
const prefsOn: IntegrationPrefs = { privacyMode: "TOTAL", syncNonBlocking: true }

function snap(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    id: "appt-1",
    clinicId: "clinic-1",
    type: "CONSULTA",
    status: "AGENDADO",
    // 14:00 São Paulo == 17:00 UTC
    scheduledAt: new Date("2026-06-15T17:00:00Z"),
    endAt: new Date("2026-06-15T17:50:00Z"),
    title: null,
    patientName: "Maria Silva",
    clinicName: "Clínica X",
    timezone: "America/Sao_Paulo",
    ...overrides,
  }
}

describe("isSyncableType", () => {
  it("CONSULTA/TAREFA/REUNIAO always sync", () => {
    expect(isSyncableType("CONSULTA", prefsOff)).toBe(true)
    expect(isSyncableType("TAREFA", prefsOff)).toBe(true)
    expect(isSyncableType("REUNIAO", prefsOff)).toBe(true)
  })

  it("LEMBRETE/NOTA only sync when syncNonBlocking is on", () => {
    expect(isSyncableType("LEMBRETE", prefsOff)).toBe(false)
    expect(isSyncableType("NOTA", prefsOff)).toBe(false)
    expect(isSyncableType("LEMBRETE", prefsOn)).toBe(true)
    expect(isSyncableType("NOTA", prefsOn)).toBe(true)
  })
})

describe("buildGoogleEventBody", () => {
  it("uses the clinic timezone and renders local wall-clock", () => {
    const body = buildGoogleEventBody(snap(), prefsOff, "https://app.example.com")
    expect(body.start.timeZone).toBe("America/Sao_Paulo")
    expect(body.start.dateTime).toBe("2026-06-15T14:00:00")
    expect(body.end.dateTime).toBe("2026-06-15T14:50:00")
  })

  it("blocking types are opaque", () => {
    expect(buildGoogleEventBody(snap({ type: "CONSULTA" }), prefsOff, "x").transparency).toBe(
      "opaque"
    )
    expect(buildGoogleEventBody(snap({ type: "REUNIAO" }), prefsOff, "x").transparency).toBe(
      "opaque"
    )
  })

  it("non-blocking types are transparent", () => {
    expect(
      buildGoogleEventBody(snap({ type: "LEMBRETE", title: "Lembrete" }), prefsOn, "x").transparency
    ).toBe("transparent")
  })

  it("extendedProperties carry appointmentId and clinicId", () => {
    const body = buildGoogleEventBody(snap(), prefsOff, "x")
    expect(body.extendedProperties.private.clinicaAppointmentId).toBe("appt-1")
    expect(body.extendedProperties.private.clinicaClinicId).toBe("clinic-1")
  })

  it("description only contains the agenda deep link, never notes/PII", () => {
    const body = buildGoogleEventBody(snap(), prefsOff, "https://app.example.com/")
    expect(body.description).toBe("https://app.example.com/agenda?date=2026-06-15")
    expect(body.description).not.toContain("Maria")
  })
})

describe("computeSyncHash", () => {
  it("is stable for identical content regardless of key order", () => {
    const a = buildGoogleEventBody(snap(), prefsOff, "x")
    // Re-create with keys shuffled via JSON round-trip into a reordered object.
    const reordered = {
      end: a.end,
      start: a.start,
      extendedProperties: a.extendedProperties,
      transparency: a.transparency,
      summary: a.summary,
      description: a.description,
    } as typeof a
    expect(computeSyncHash(a)).toBe(computeSyncHash(reordered))
  })

  it("changes when the time changes", () => {
    const a = computeSyncHash(buildGoogleEventBody(snap(), prefsOff, "x"))
    const b = computeSyncHash(
      buildGoogleEventBody(snap({ scheduledAt: new Date("2026-06-15T18:00:00Z") }), prefsOff, "x")
    )
    expect(a).not.toBe(b)
  })

  it("changes when the title changes (privacy mode flips)", () => {
    const a = computeSyncHash(buildGoogleEventBody(snap(), prefsOff, "x"))
    const b = computeSyncHash(
      buildGoogleEventBody(snap(), { privacyMode: "PRIMEIRO_NOME", syncNonBlocking: false }, "x")
    )
    expect(a).not.toBe(b)
  })
})
