import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPatientFindFirst = vi.fn()
const mockAppointmentFindFirst = vi.fn()
const mockProfessionalFindFirst = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findFirst: (...a: unknown[]) => mockPatientFindFirst(...a) },
    appointment: { findFirst: (...a: unknown[]) => mockAppointmentFindFirst(...a) },
    professionalProfile: { findFirst: (...a: unknown[]) => mockProfessionalFindFirst(...a) },
  },
}))

import {
  assertPatientInClinic,
  assertAppointmentInClinic,
  assertProfessionalInClinic,
  OwnershipError,
} from "./ownership"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("assertPatientInClinic", () => {
  it("resolves when the patient belongs to the clinic", async () => {
    mockPatientFindFirst.mockResolvedValue({ id: "p1" })
    await expect(assertPatientInClinic("c1", "p1")).resolves.toBeUndefined()
    expect(mockPatientFindFirst).toHaveBeenCalledWith({
      where: { id: "p1", clinicId: "c1" },
      select: { id: true },
    })
  })

  it("throws OwnershipError when the patient is missing or cross-tenant", async () => {
    mockPatientFindFirst.mockResolvedValue(null)
    await expect(assertPatientInClinic("c1", "p1")).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe("assertAppointmentInClinic", () => {
  it("returns selected fields when the appointment belongs to the clinic", async () => {
    const appt = {
      id: "a1",
      type: "CONSULTA",
      patientId: "p1",
      scheduledAt: new Date("2026-05-14T15:00:00Z"),
      status: "FINALIZADO",
      professionalProfileId: "prof1",
      attendingProfessionalId: null,
    }
    mockAppointmentFindFirst.mockResolvedValue(appt)
    const result = await assertAppointmentInClinic("c1", "a1")
    expect(result).toEqual(appt)
  })

  it("throws OwnershipError when the appointment is missing or cross-tenant", async () => {
    mockAppointmentFindFirst.mockResolvedValue(null)
    await expect(assertAppointmentInClinic("c1", "a1")).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe("assertProfessionalInClinic", () => {
  it("resolves when the professional belongs to the clinic", async () => {
    mockProfessionalFindFirst.mockResolvedValue({ id: "prof1" })
    await expect(assertProfessionalInClinic("c1", "prof1")).resolves.toBeUndefined()
    expect(mockProfessionalFindFirst).toHaveBeenCalledWith({
      where: { id: "prof1", user: { clinicId: "c1" } },
      select: { id: true },
    })
  })

  it("throws OwnershipError when the professional is missing or cross-tenant", async () => {
    mockProfessionalFindFirst.mockResolvedValue(null)
    await expect(assertProfessionalInClinic("c1", "prof1")).rejects.toBeInstanceOf(OwnershipError)
  })
})
