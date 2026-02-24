import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { getPatientPhoneNumbers } from "./phone-numbers"

const mockFindFirst = vi.mocked(prisma.patient.findFirst)

describe("getPatientPhoneNumbers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns empty array when patient is not found", async () => {
    mockFindFirst.mockResolvedValue(null)

    const result = await getPatientPhoneNumbers("patient-1", "clinic-1")

    expect(result).toEqual([])
  })

  it("returns primary phone with null label", async () => {
    mockFindFirst.mockResolvedValue({
      phone: "5511999999999",
      additionalPhones: [],
    } as never)

    const result = await getPatientPhoneNumbers("patient-1", "clinic-1")

    expect(result).toEqual([
      { phone: "5511999999999", label: null },
    ])
  })

  it("returns primary phone plus additional phones", async () => {
    mockFindFirst.mockResolvedValue({
      phone: "5511999999999",
      additionalPhones: [
        { phone: "5511888888888", label: "Mãe" },
        { phone: "5511777777777", label: "Pai" },
      ],
    } as never)

    const result = await getPatientPhoneNumbers("patient-1", "clinic-1")

    expect(result).toEqual([
      { phone: "5511999999999", label: null },
      { phone: "5511888888888", label: "Mãe" },
      { phone: "5511777777777", label: "Pai" },
    ])
  })

  it("filters by notify=true by default", async () => {
    mockFindFirst.mockResolvedValue({
      phone: "5511999999999",
      additionalPhones: [
        { phone: "5511888888888", label: "Mãe" },
      ],
    } as never)

    await getPatientPhoneNumbers("patient-1", "clinic-1")

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "patient-1", clinicId: "clinic-1" },
        select: expect.objectContaining({
          additionalPhones: expect.objectContaining({
            where: { notify: true },
          }),
        }),
      })
    )
  })

  it("passes notify=true filter when notifyOnly is true", async () => {
    mockFindFirst.mockResolvedValue({
      phone: "5511999999999",
      additionalPhones: [],
    } as never)

    await getPatientPhoneNumbers("patient-1", "clinic-1", { notifyOnly: true })

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          additionalPhones: expect.objectContaining({
            where: { notify: true },
          }),
        }),
      })
    )
  })

  it("does not filter by notify when notifyOnly is false", async () => {
    mockFindFirst.mockResolvedValue({
      phone: "5511999999999",
      additionalPhones: [
        { phone: "5511888888888", label: "Mãe" },
        { phone: "5511777777777", label: "Trabalho" },
      ],
    } as never)

    await getPatientPhoneNumbers("patient-1", "clinic-1", { notifyOnly: false })

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          additionalPhones: expect.objectContaining({
            where: undefined,
          }),
        }),
      })
    )
  })

  it("always includes primary phone even when notifyOnly is true", async () => {
    mockFindFirst.mockResolvedValue({
      phone: "5511999999999",
      additionalPhones: [],
    } as never)

    const result = await getPatientPhoneNumbers("patient-1", "clinic-1", { notifyOnly: true })

    expect(result).toEqual([
      { phone: "5511999999999", label: null },
    ])
  })
})
