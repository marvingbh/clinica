import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPatientFindFirst = vi.fn()
const mockAppointmentFindFirst = vi.fn()
const mockProfessionalFindFirst = vi.fn()
const mockInvoiceCount = vi.fn()
const mockReconciliationLinkCount = vi.fn()
const mockInvoiceItemCount = vi.fn()
const mockScaleAdministrationFindFirst = vi.fn()
const mockScaleScheduleFindFirst = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findFirst: (...a: unknown[]) => mockPatientFindFirst(...a) },
    appointment: { findFirst: (...a: unknown[]) => mockAppointmentFindFirst(...a) },
    professionalProfile: { findFirst: (...a: unknown[]) => mockProfessionalFindFirst(...a) },
    invoice: { count: (...a: unknown[]) => mockInvoiceCount(...a) },
    reconciliationLink: { count: (...a: unknown[]) => mockReconciliationLinkCount(...a) },
    invoiceItem: { count: (...a: unknown[]) => mockInvoiceItemCount(...a) },
    scaleAdministration: { findFirst: (...a: unknown[]) => mockScaleAdministrationFindFirst(...a) },
    scaleSchedule: { findFirst: (...a: unknown[]) => mockScaleScheduleFindFirst(...a) },
  },
}))

import {
  assertPatientInClinic,
  assertAppointmentInClinic,
  assertProfessionalInClinic,
  assertInvoicesInClinic,
  assertReconciliationLinksInClinic,
  assertInvoiceItemsInClinic,
  assertScaleAdministrationInClinic,
  assertScaleScheduleInClinic,
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

describe("assertInvoiceItemsInClinic", () => {
  it("resolves when every item belongs to the clinic and patient", async () => {
    mockInvoiceItemCount.mockResolvedValue(2)
    await expect(assertInvoiceItemsInClinic("c1", ["it1", "it2"], "p1")).resolves.toBeUndefined()
    expect(mockInvoiceItemCount).toHaveBeenCalledWith({
      where: { id: { in: ["it1", "it2"] }, invoice: { clinicId: "c1", patientId: "p1" } },
    })
  })

  it("omits the patient filter when patientId is not provided", async () => {
    mockInvoiceItemCount.mockResolvedValue(1)
    await expect(assertInvoiceItemsInClinic("c1", ["it1"])).resolves.toBeUndefined()
    expect(mockInvoiceItemCount).toHaveBeenCalledWith({
      where: { id: { in: ["it1"] }, invoice: { clinicId: "c1" } },
    })
  })

  it("is a no-op for an empty list (no query)", async () => {
    await expect(assertInvoiceItemsInClinic("c1", [])).resolves.toBeUndefined()
    expect(mockInvoiceItemCount).not.toHaveBeenCalled()
  })

  it("throws OwnershipError when some item is missing or cross-tenant", async () => {
    mockInvoiceItemCount.mockResolvedValue(1)
    await expect(assertInvoiceItemsInClinic("c1", ["it1", "it2"], "p1")).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe("assertScaleAdministrationInClinic", () => {
  it("returns selected fields when the administration belongs to the clinic", async () => {
    const admin = {
      id: "sa1",
      patientId: "p1",
      professionalProfileId: "prof1",
      status: "CONCLUIDA",
      scaleCode: "PHQ9",
    }
    mockScaleAdministrationFindFirst.mockResolvedValue(admin)
    const result = await assertScaleAdministrationInClinic("c1", "sa1")
    expect(result).toEqual(admin)
    expect(mockScaleAdministrationFindFirst).toHaveBeenCalledWith({
      where: { id: "sa1", clinicId: "c1" },
      select: {
        id: true,
        patientId: true,
        professionalProfileId: true,
        status: true,
        scaleCode: true,
      },
    })
  })

  it("throws OwnershipError when missing or cross-tenant", async () => {
    mockScaleAdministrationFindFirst.mockResolvedValue(null)
    await expect(assertScaleAdministrationInClinic("c1", "sa1")).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe("assertScaleScheduleInClinic", () => {
  it("returns id and patientId when the schedule belongs to the clinic", async () => {
    mockScaleScheduleFindFirst.mockResolvedValue({ id: "sch1", patientId: "p1" })
    const result = await assertScaleScheduleInClinic("c1", "sch1")
    expect(result).toEqual({ id: "sch1", patientId: "p1" })
  })

  it("throws OwnershipError when missing or cross-tenant", async () => {
    mockScaleScheduleFindFirst.mockResolvedValue(null)
    await expect(assertScaleScheduleInClinic("c1", "sch1")).rejects.toBeInstanceOf(OwnershipError)
  })
})
