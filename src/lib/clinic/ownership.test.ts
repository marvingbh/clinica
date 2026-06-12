import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPatientFindFirst = vi.fn()
const mockAppointmentFindFirst = vi.fn()
const mockProfessionalFindFirst = vi.fn()
const mockInvoiceCount = vi.fn()
const mockReconciliationLinkCount = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findFirst: (...a: unknown[]) => mockPatientFindFirst(...a) },
    appointment: { findFirst: (...a: unknown[]) => mockAppointmentFindFirst(...a) },
    professionalProfile: { findFirst: (...a: unknown[]) => mockProfessionalFindFirst(...a) },
    invoice: { count: (...a: unknown[]) => mockInvoiceCount(...a) },
    reconciliationLink: { count: (...a: unknown[]) => mockReconciliationLinkCount(...a) },
  },
}))

import {
  assertPatientInClinic,
  assertAppointmentInClinic,
  assertProfessionalInClinic,
  assertInvoicesInClinic,
  assertReconciliationLinksInClinic,
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

describe("assertInvoicesInClinic", () => {
  it("resolves when every invoice belongs to the clinic", async () => {
    mockInvoiceCount.mockResolvedValue(2)
    await expect(assertInvoicesInClinic("c1", ["i1", "i2"])).resolves.toBeUndefined()
    expect(mockInvoiceCount).toHaveBeenCalledWith({ where: { id: { in: ["i1", "i2"] }, clinicId: "c1" } })
  })

  it("deduplicates ids before counting", async () => {
    mockInvoiceCount.mockResolvedValue(1)
    await expect(assertInvoicesInClinic("c1", ["i1", "i1"])).resolves.toBeUndefined()
    expect(mockInvoiceCount).toHaveBeenCalledWith({ where: { id: { in: ["i1"] }, clinicId: "c1" } })
  })

  it("is a no-op for an empty list (no query)", async () => {
    await expect(assertInvoicesInClinic("c1", [])).resolves.toBeUndefined()
    expect(mockInvoiceCount).not.toHaveBeenCalled()
  })

  it("throws OwnershipError when some invoice is missing or cross-tenant", async () => {
    mockInvoiceCount.mockResolvedValue(1)
    await expect(assertInvoicesInClinic("c1", ["i1", "i2"])).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe("assertReconciliationLinksInClinic", () => {
  it("resolves when every link belongs to the clinic", async () => {
    mockReconciliationLinkCount.mockResolvedValue(2)
    await expect(assertReconciliationLinksInClinic("c1", ["l1", "l2"])).resolves.toBeUndefined()
  })

  it("throws OwnershipError when some link is missing or cross-tenant", async () => {
    mockReconciliationLinkCount.mockResolvedValue(0)
    await expect(assertReconciliationLinksInClinic("c1", ["l1"])).rejects.toBeInstanceOf(OwnershipError)
  })
})
