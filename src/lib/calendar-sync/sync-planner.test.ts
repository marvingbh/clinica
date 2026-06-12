import { describe, it, expect } from "vitest"
import { planSyncAction } from "./sync-planner"
import type { SyncSnapshot, IntegrationPrefs } from "./types"

const prefsOff: IntegrationPrefs = { privacyMode: "TOTAL", syncNonBlocking: false }
const prefsOn: IntegrationPrefs = { privacyMode: "TOTAL", syncNonBlocking: true }

function snap(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    id: "a1",
    clinicId: "c1",
    type: "CONSULTA",
    status: "AGENDADO",
    scheduledAt: new Date("2026-06-15T17:00:00Z"),
    endAt: new Date("2026-06-15T17:50:00Z"),
    title: null,
    patientName: "Maria",
    clinicName: "Clínica",
    timezone: "America/Sao_Paulo",
    ...overrides,
  }
}

describe("planSyncAction", () => {
  it("null snapshot (deleted appointment) → deleteRemote", () => {
    expect(planSyncAction(null, prefsOff)).toBe("deleteRemote")
  })

  it("CANCELADO → deleteRemote", () => {
    expect(planSyncAction(snap({ status: "CANCELADO" }), prefsOff)).toBe("deleteRemote")
    expect(planSyncAction(snap({ status: "CANCELADO_FALTA" }), prefsOff)).toBe("deleteRemote")
    expect(planSyncAction(snap({ status: "CANCELADO_PROFISSIONAL" }), prefsOff)).toBe(
      "deleteRemote"
    )
  })

  it("non-syncable type (LEMBRETE without opt-in) → deleteRemote", () => {
    expect(planSyncAction(snap({ type: "LEMBRETE", title: "x" }), prefsOff)).toBe("deleteRemote")
  })

  it("LEMBRETE with syncNonBlocking → upsert", () => {
    expect(planSyncAction(snap({ type: "LEMBRETE", title: "x" }), prefsOn)).toBe("upsert")
  })

  it("CONSULTA AGENDADO/CONFIRMADO/FINALIZADO → upsert", () => {
    expect(planSyncAction(snap({ status: "AGENDADO" }), prefsOff)).toBe("upsert")
    expect(planSyncAction(snap({ status: "CONFIRMADO" }), prefsOff)).toBe("upsert")
    expect(planSyncAction(snap({ status: "FINALIZADO" }), prefsOff)).toBe("upsert")
  })
})
