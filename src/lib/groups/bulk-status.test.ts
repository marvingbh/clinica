import { describe, it, expect } from "vitest"
import {
  getAppointmentsToUpdate,
  shouldCreateCredit,
  shouldCleanupCredit,
  hasUnownedAppointments,
  getUniquePatientIds,
  buildCreditReason,
  type BulkStatusAppointment,
} from "./bulk-status"

function makeAppointment(overrides: Partial<BulkStatusAppointment> = {}): BulkStatusAppointment {
  return {
    id: "apt-1",
    status: "AGENDADO",
    patientId: "patient-1",
    professionalProfileId: "prof-1",
    creditGenerated: false,
    scheduledAt: new Date("2026-03-10T10:00:00"),
    additionalProfessionals: [],
    ...overrides,
  }
}

describe("getAppointmentsToUpdate", () => {
  it("filters out appointments already in target status", () => {
    const appointments = [
      makeAppointment({ id: "1", status: "AGENDADO" }),
      makeAppointment({ id: "2", status: "CONFIRMADO" }),
      makeAppointment({ id: "3", status: "AGENDADO" }),
    ]
    const result = getAppointmentsToUpdate(appointments, "AGENDADO")
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("2")
  })

  it("returns all appointments when none match target status", () => {
    const appointments = [
      makeAppointment({ id: "1", status: "AGENDADO" }),
      makeAppointment({ id: "2", status: "CONFIRMADO" }),
    ]
    const result = getAppointmentsToUpdate(appointments, "FINALIZADO")
    expect(result).toHaveLength(2)
  })

  it("returns empty array when all match target status", () => {
    const appointments = [
      makeAppointment({ id: "1", status: "FINALIZADO" }),
      makeAppointment({ id: "2", status: "FINALIZADO" }),
    ]
    const result = getAppointmentsToUpdate(appointments, "FINALIZADO")
    expect(result).toHaveLength(0)
  })

  it("returns empty array for empty input", () => {
    expect(getAppointmentsToUpdate([], "AGENDADO")).toHaveLength(0)
  })
})

describe("shouldCreateCredit", () => {
  it("returns true when transitioning to CANCELADO_ACORDADO with patient and no existing credit", () => {
    const apt = makeAppointment({ patientId: "p1", creditGenerated: false })
    expect(shouldCreateCredit(apt, "CANCELADO_ACORDADO")).toBe(true)
  })

  it("returns false when credit already generated", () => {
    const apt = makeAppointment({ patientId: "p1", creditGenerated: true })
    expect(shouldCreateCredit(apt, "CANCELADO_ACORDADO")).toBe(false)
  })

  it("returns false when no patient", () => {
    const apt = makeAppointment({ patientId: null, creditGenerated: false })
    expect(shouldCreateCredit(apt, "CANCELADO_ACORDADO")).toBe(false)
  })

  it("returns false for non-CANCELADO_ACORDADO target", () => {
    const apt = makeAppointment({ patientId: "p1", creditGenerated: false })
    expect(shouldCreateCredit(apt, "FINALIZADO")).toBe(false)
    expect(shouldCreateCredit(apt, "CANCELADO_FALTA")).toBe(false)
    expect(shouldCreateCredit(apt, "CANCELADO_PROFISSIONAL")).toBe(false)
    expect(shouldCreateCredit(apt, "CONFIRMADO")).toBe(false)
  })
})

describe("shouldCleanupCredit", () => {
  it("returns true when leaving CANCELADO_ACORDADO", () => {
    expect(shouldCleanupCredit("CANCELADO_ACORDADO", "AGENDADO")).toBe(true)
    expect(shouldCleanupCredit("CANCELADO_ACORDADO", "FINALIZADO")).toBe(true)
    expect(shouldCleanupCredit("CANCELADO_ACORDADO", "CONFIRMADO")).toBe(true)
  })

  it("returns false when staying in CANCELADO_ACORDADO", () => {
    expect(shouldCleanupCredit("CANCELADO_ACORDADO", "CANCELADO_ACORDADO")).toBe(false)
  })

  it("returns false when not coming from CANCELADO_ACORDADO", () => {
    expect(shouldCleanupCredit("AGENDADO", "FINALIZADO")).toBe(false)
    expect(shouldCleanupCredit("CONFIRMADO", "CANCELADO_ACORDADO")).toBe(false)
    expect(shouldCleanupCredit("FINALIZADO", "AGENDADO")).toBe(false)
  })
})

describe("hasUnownedAppointments", () => {
  it("returns false when user owns all appointments", () => {
    const appointments = [
      makeAppointment({ professionalProfileId: "prof-1" }),
      makeAppointment({ professionalProfileId: "prof-1" }),
    ]
    expect(hasUnownedAppointments(appointments, "prof-1")).toBe(false)
  })

  it("returns false when user is additional professional", () => {
    const appointments = [
      makeAppointment({
        professionalProfileId: "prof-2",
        additionalProfessionals: [{ professionalProfileId: "prof-1" }],
      }),
    ]
    expect(hasUnownedAppointments(appointments, "prof-1")).toBe(false)
  })

  it("returns true when user does not own an appointment", () => {
    const appointments = [
      makeAppointment({ professionalProfileId: "prof-1" }),
      makeAppointment({ professionalProfileId: "prof-2", additionalProfessionals: [] }),
    ]
    expect(hasUnownedAppointments(appointments, "prof-1")).toBe(true)
  })

  it("returns false for empty list", () => {
    expect(hasUnownedAppointments([], "prof-1")).toBe(false)
  })

  it("handles mix of owned and participated", () => {
    const appointments = [
      makeAppointment({ professionalProfileId: "prof-1" }),
      makeAppointment({
        professionalProfileId: "prof-3",
        additionalProfessionals: [{ professionalProfileId: "prof-1" }],
      }),
    ]
    expect(hasUnownedAppointments(appointments, "prof-1")).toBe(false)
  })
})

describe("getUniquePatientIds", () => {
  it("returns unique patient IDs", () => {
    const appointments = [
      makeAppointment({ patientId: "p1" }),
      makeAppointment({ patientId: "p2" }),
      makeAppointment({ patientId: "p1" }),
    ]
    const ids = getUniquePatientIds(appointments)
    expect(ids).toHaveLength(2)
    expect(ids).toContain("p1")
    expect(ids).toContain("p2")
  })

  it("skips null patient IDs", () => {
    const appointments = [
      makeAppointment({ patientId: "p1" }),
      makeAppointment({ patientId: null }),
    ]
    const ids = getUniquePatientIds(appointments)
    expect(ids).toEqual(["p1"])
  })

  it("returns empty array when no patients", () => {
    const appointments = [
      makeAppointment({ patientId: null }),
    ]
    expect(getUniquePatientIds(appointments)).toHaveLength(0)
  })

  it("returns empty array for empty input", () => {
    expect(getUniquePatientIds([])).toHaveLength(0)
  })
})

describe("buildCreditReason", () => {
  it("formats date in pt-BR", () => {
    const date = new Date("2026-03-10T10:00:00")
    const reason = buildCreditReason(date)
    expect(reason).toMatch(/^Desmarcou - /)
    expect(reason).toContain("10")
    expect(reason).toContain("2026")
  })
})
