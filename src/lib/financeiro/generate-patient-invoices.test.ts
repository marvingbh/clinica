import { describe, it, expect, vi, beforeEach } from "vitest"

// --- Hoisted mocks (available to vi.mock factories) ---

const {
  mockPrisma,
  mockTx,
  mockGenerateMonthlyInvoice,
  mockGeneratePerSessionInvoices,
  mockResolveGrouping,
  mockFetchUninvoicedBulk,
} = vi.hoisted(() => {
  const mockTx = {
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "inv-1" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    invoiceItem: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sessionCredit: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({}),
    },
  }

  const mockPrisma = {
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sessionCredit: {
      updateMany: vi.fn().mockResolvedValue({}),
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    professionalProfile: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }

  return {
    mockPrisma,
    mockTx,
    mockGenerateMonthlyInvoice: vi.fn().mockResolvedValue("generated"),
    mockGeneratePerSessionInvoices: vi.fn().mockResolvedValue({ generated: 1, updated: 0, skipped: 0 }),
    mockResolveGrouping: vi.fn().mockReturnValue("MONTHLY"),
    mockFetchUninvoicedBulk: vi.fn().mockResolvedValue([]),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}))

vi.mock("./generate-monthly-invoice", () => ({
  generateMonthlyInvoice: (...args: unknown[]) => mockGenerateMonthlyInvoice(...args),
}))

vi.mock("./generate-per-session-invoices", () => ({
  generatePerSessionInvoices: (...args: unknown[]) => mockGeneratePerSessionInvoices(...args),
}))

vi.mock("./invoice-grouping", () => ({
  resolveGrouping: (...args: unknown[]) => mockResolveGrouping(...args),
}))

vi.mock("./uninvoiced-appointments", () => ({
  fetchUninvoicedPriorAppointmentsBulk: (...args: unknown[]) => mockFetchUninvoicedBulk(...args),
}))

import { generateInvoicesForPatient } from "./generate-patient-invoices"

// --- Helpers ---

function makePatient(overrides: Partial<Parameters<typeof generateInvoicesForPatient>[0]["patient"]> = {}) {
  return {
    id: "patient-1",
    name: "João Silva",
    motherName: "Maria Silva",
    fatherName: "José Silva",
    sessionFee: 200,
    showAppointmentDaysOnInvoice: true,
    invoiceDueDay: null as number | null,
    invoiceMessageTemplate: null as string | null,
    invoiceGrouping: null as string | null,
    splitInvoiceByProfessional: false,
    referenceProfessionalId: null as string | null,
    ...overrides,
  }
}

function makeClinic(overrides: Partial<Parameters<typeof generateInvoicesForPatient>[0]["clinic"]> = {}) {
  return {
    invoiceDueDay: 15,
    invoiceMessageTemplate: null as string | null,
    billingMode: "PER_SESSION" as string | null,
    invoiceGrouping: null as string | null,
    ...overrides,
  }
}

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "apt-1",
    scheduledAt: new Date("2026-03-10T14:00:00Z"),
    status: "CONFIRMADO",
    type: "CONSULTA",
    title: null,
    recurrenceId: "rec-1",
    groupId: null,
    sessionGroupId: null,
    price: null,
    professionalProfileId: "prof-1",
    attendingProfessionalId: null,
    ...overrides,
  }
}

function defaultParams(overrides: Partial<Parameters<typeof generateInvoicesForPatient>[0]> = {}) {
  return {
    clinicId: "clinic-1",
    patient: makePatient(),
    clinic: makeClinic(),
    month: 3,
    year: 2026,
    ...overrides,
  }
}

// --- Tests ---

describe("generateInvoicesForPatient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.invoice.findMany.mockResolvedValue([])
    mockPrisma.invoice.deleteMany.mockResolvedValue({})
    mockPrisma.sessionCredit.updateMany.mockResolvedValue({})
    mockPrisma.appointment.findMany.mockResolvedValue([])
    mockPrisma.professionalProfile.findMany.mockResolvedValue([])
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx))
    mockGenerateMonthlyInvoice.mockResolvedValue("generated")
    mockGeneratePerSessionInvoices.mockResolvedValue({ generated: 1, updated: 0, skipped: 0 })
    mockResolveGrouping.mockReturnValue("MONTHLY")
    mockFetchUninvoicedBulk.mockResolvedValue([])
  })

  describe("deleting existing non-PAGO invoices", () => {
    it("deletes non-PAGO invoices and releases their consumed credits before regenerating", async () => {
      const existingInvoices = [{ id: "inv-old-1" }, { id: "inv-old-2" }]
      mockPrisma.invoice.findMany.mockResolvedValue(existingInvoices)

      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      await generateInvoicesForPatient(defaultParams())

      // Should query invoices with notIn: ["PAGO"]
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith({
        where: {
          clinicId: "clinic-1",
          patientId: "patient-1",
          referenceMonth: 3,
          referenceYear: 2026,
          status: { notIn: ["PAGO"] },
        },
        select: { id: true },
      })

      // Should release credits for each old invoice
      expect(mockPrisma.sessionCredit.updateMany).toHaveBeenCalledTimes(2)
      expect(mockPrisma.sessionCredit.updateMany).toHaveBeenCalledWith({
        where: { consumedByInvoiceId: "inv-old-1" },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })
      expect(mockPrisma.sessionCredit.updateMany).toHaveBeenCalledWith({
        where: { consumedByInvoiceId: "inv-old-2" },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })

      // Should delete them in bulk
      expect(mockPrisma.invoice.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["inv-old-1", "inv-old-2"] } },
      })
    })

    it("does not call deleteMany when there are no existing non-PAGO invoices", async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([])
      mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment()])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      await generateInvoicesForPatient(defaultParams())

      expect(mockPrisma.sessionCredit.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.invoice.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe("no appointments", () => {
    it("returns zeros when both month appointments and prior uninvoiced are empty", async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([])
      mockFetchUninvoicedBulk.mockResolvedValue([])

      const result = await generateInvoicesForPatient(defaultParams())

      expect(result).toEqual({ generated: 0, updated: 0, skipped: 0 })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockGenerateMonthlyInvoice).not.toHaveBeenCalled()
      expect(mockGeneratePerSessionInvoices).not.toHaveBeenCalled()
    })
  })

  describe("splitInvoiceByProfessional", () => {
    it("groups by professionalProfileId when splitInvoiceByProfessional is true", async () => {
      const apt1 = makeAppointment({ id: "apt-1", professionalProfileId: "prof-1" })
      const apt2 = makeAppointment({ id: "apt-2", professionalProfileId: "prof-2" })
      mockPrisma.appointment.findMany.mockResolvedValue([apt1, apt2])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
        { id: "prof-2", user: { name: "Dr. Bruno" } },
      ])

      const patient = makePatient({ splitInvoiceByProfessional: true })
      await generateInvoicesForPatient(defaultParams({ patient }))

      // Two separate transaction calls, one per professional
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
      expect(mockGenerateMonthlyInvoice).toHaveBeenCalledTimes(2)

      // First call should have prof-1 appointments only
      const firstCallParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(firstCallParams.professionalProfileId).toBe("prof-1")
      expect(firstCallParams.profName).toBe("Dr. Ana")

      // Second call should have prof-2 appointments only
      const secondCallParams = mockGenerateMonthlyInvoice.mock.calls[1][1]
      expect(secondCallParams.professionalProfileId).toBe("prof-2")
      expect(secondCallParams.profName).toBe("Dr. Bruno")
    })

    it("uses consolidated group when splitInvoiceByProfessional is false", async () => {
      const apt1 = makeAppointment({ id: "apt-1", professionalProfileId: "prof-1" })
      const apt2 = makeAppointment({ id: "apt-2", professionalProfileId: "prof-2" })
      mockPrisma.appointment.findMany.mockResolvedValue([apt1, apt2])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
        { id: "prof-2", user: { name: "Dr. Bruno" } },
      ])

      const patient = makePatient({
        splitInvoiceByProfessional: false,
        referenceProfessionalId: "prof-1",
      })
      await generateInvoicesForPatient(defaultParams({ patient }))

      // Only one transaction call with all appointments
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockGenerateMonthlyInvoice).toHaveBeenCalledTimes(1)

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(callParams.professionalProfileId).toBe("prof-1")
      expect(callParams.appointments).toHaveLength(2)
    })

    it("falls back to first appointment professionalProfileId when no referenceProfessionalId", async () => {
      const apt = makeAppointment({ id: "apt-1", professionalProfileId: "prof-3" })
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-3", user: { name: "Dr. Carlos" } },
      ])

      const patient = makePatient({
        splitInvoiceByProfessional: false,
        referenceProfessionalId: null,
      })
      await generateInvoicesForPatient(defaultParams({ patient }))

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(callParams.professionalProfileId).toBe("prof-3")
      expect(callParams.profName).toBe("Dr. Carlos")
    })
  })

  describe("invoice grouping dispatch", () => {
    it("calls generatePerSessionInvoices when grouping resolves to PER_SESSION", async () => {
      mockResolveGrouping.mockReturnValue("PER_SESSION")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const result = await generateInvoicesForPatient(defaultParams())

      expect(mockGeneratePerSessionInvoices).toHaveBeenCalledTimes(1)
      expect(mockGenerateMonthlyInvoice).not.toHaveBeenCalled()
      expect(result).toEqual({ generated: 1, updated: 0, skipped: 0 })
    })

    it("calls generateMonthlyInvoice when grouping resolves to MONTHLY", async () => {
      mockResolveGrouping.mockReturnValue("MONTHLY")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const result = await generateInvoicesForPatient(defaultParams())

      expect(mockGenerateMonthlyInvoice).toHaveBeenCalledTimes(1)
      expect(mockGeneratePerSessionInvoices).not.toHaveBeenCalled()
      expect(result).toEqual({ generated: 1, updated: 0, skipped: 0 })
    })

    it("passes correct params to generateMonthlyInvoice", async () => {
      mockResolveGrouping.mockReturnValue("MONTHLY")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const patient = makePatient({ invoiceDueDay: 20 })
      await generateInvoicesForPatient(defaultParams({ patient }))

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(callParams.clinicId).toBe("clinic-1")
      expect(callParams.patientId).toBe("patient-1")
      expect(callParams.month).toBe(3)
      expect(callParams.year).toBe(2026)
      expect(callParams.sessionFee).toBe(200)
      expect(callParams.showAppointmentDays).toBe(true)
      expect(callParams.billingMode).toBe("PER_SESSION")
      expect(callParams.patient.name).toBe("João Silva")
      expect(callParams.dueDate).toEqual(new Date(Date.UTC(2026, 2, 20, 12)))
    })

    it("passes correct params to generatePerSessionInvoices", async () => {
      mockResolveGrouping.mockReturnValue("PER_SESSION")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      await generateInvoicesForPatient(defaultParams())

      const callParams = mockGeneratePerSessionInvoices.mock.calls[0][1]
      expect(callParams.clinicId).toBe("clinic-1")
      expect(callParams.patientId).toBe("patient-1")
      expect(callParams.profId).toBe("prof-1")
      expect(callParams.month).toBe(3)
      expect(callParams.year).toBe(2026)
      expect(callParams.sessionFee).toBe(200)
      expect(callParams.patientName).toBe("João Silva")
      expect(callParams.motherName).toBe("Maria Silva")
      expect(callParams.fatherName).toBe("José Silva")
    })

    it("resolves grouping with clinic and patient values", async () => {
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const patient = makePatient({ invoiceGrouping: "PER_SESSION" })
      const clinic = makeClinic({ invoiceGrouping: "MONTHLY" })
      await generateInvoicesForPatient(defaultParams({ patient, clinic }))

      expect(mockResolveGrouping).toHaveBeenCalledWith("MONTHLY", "PER_SESSION")
    })

    it("defaults clinic invoiceGrouping to MONTHLY when null", async () => {
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const clinic = makeClinic({ invoiceGrouping: null })
      await generateInvoicesForPatient(defaultParams({ clinic }))

      expect(mockResolveGrouping).toHaveBeenCalledWith("MONTHLY", null)
    })
  })

  describe("appointment deduplication", () => {
    it("does not duplicate prior uninvoiced appointments that also appear in monthApts", async () => {
      const sharedApt = makeAppointment({ id: "apt-shared", professionalProfileId: "prof-1" })
      const monthOnlyApt = makeAppointment({ id: "apt-month", professionalProfileId: "prof-1" })
      const priorOnlyApt = makeAppointment({
        id: "apt-prior",
        professionalProfileId: "prof-1",
        scheduledAt: new Date("2026-02-15T14:00:00Z"),
        patientId: "patient-1",
      })

      mockPrisma.appointment.findMany.mockResolvedValue([sharedApt, monthOnlyApt])
      mockFetchUninvoicedBulk.mockResolvedValue([
        { ...sharedApt, patientId: "patient-1" },
        priorOnlyApt,
      ])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      await generateInvoicesForPatient(defaultParams())

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      // Should have 3 unique appointments: sharedApt, monthOnlyApt, priorOnlyApt
      const aptIds = callParams.appointments.map((a: { id: string }) => a.id)
      expect(aptIds).toHaveLength(3)
      expect(aptIds).toContain("apt-shared")
      expect(aptIds).toContain("apt-month")
      expect(aptIds).toContain("apt-prior")
    })

    it("generates invoices from prior uninvoiced appointments alone when no month appointments exist", async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([])
      const priorApt = makeAppointment({
        id: "apt-prior",
        scheduledAt: new Date("2026-02-10T14:00:00Z"),
        patientId: "patient-1",
        professionalProfileId: "prof-1",
      })
      mockFetchUninvoicedBulk.mockResolvedValue([priorApt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const result = await generateInvoicesForPatient(defaultParams())

      expect(result).toEqual({ generated: 1, updated: 0, skipped: 0 })
      expect(mockGenerateMonthlyInvoice).toHaveBeenCalledTimes(1)
    })
  })

  describe("error handling", () => {
    it("continues processing other professionals when one fails", async () => {
      const apt1 = makeAppointment({ id: "apt-1", professionalProfileId: "prof-1" })
      const apt2 = makeAppointment({ id: "apt-2", professionalProfileId: "prof-2" })
      mockPrisma.appointment.findMany.mockResolvedValue([apt1, apt2])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
        { id: "prof-2", user: { name: "Dr. Bruno" } },
      ])

      const patient = makePatient({ splitInvoiceByProfessional: true })

      // First call fails, second succeeds
      let callCount = 0
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        callCount++
        if (callCount === 1) throw new Error("Transaction failed")
        return fn(mockTx)
      })

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await generateInvoicesForPatient(defaultParams({ patient }))

      // Second professional should still succeed
      expect(result).toEqual({ generated: 1, updated: 0, skipped: 0 })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[invoice-gen] Error for patient João Silva:"),
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it("logs error and returns accumulated results when a single group fails", async () => {
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      mockPrisma.$transaction.mockRejectedValue(new Error("DB error"))

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await generateInvoicesForPatient(defaultParams())

      expect(result).toEqual({ generated: 0, updated: 0, skipped: 0 })
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe("result accumulation", () => {
    it("accumulates generated count from monthly invoices across multiple groups", async () => {
      const apt1 = makeAppointment({ id: "apt-1", professionalProfileId: "prof-1" })
      const apt2 = makeAppointment({ id: "apt-2", professionalProfileId: "prof-2" })
      mockPrisma.appointment.findMany.mockResolvedValue([apt1, apt2])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
        { id: "prof-2", user: { name: "Dr. Bruno" } },
      ])

      const patient = makePatient({ splitInvoiceByProfessional: true })

      const result = await generateInvoicesForPatient(defaultParams({ patient }))

      // Two groups, each generates one monthly invoice
      expect(result).toEqual({ generated: 2, updated: 0, skipped: 0 })
    })

    it("counts updated from monthly invoice correctly", async () => {
      mockGenerateMonthlyInvoice.mockResolvedValue("updated")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const result = await generateInvoicesForPatient(defaultParams())

      expect(result).toEqual({ generated: 0, updated: 1, skipped: 0 })
    })

    it("counts skipped from monthly invoice correctly", async () => {
      mockGenerateMonthlyInvoice.mockResolvedValue("skipped")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const result = await generateInvoicesForPatient(defaultParams())

      expect(result).toEqual({ generated: 0, updated: 0, skipped: 1 })
    })

    it("accumulates per-session results across multiple groups", async () => {
      mockResolveGrouping.mockReturnValue("PER_SESSION")
      const apt1 = makeAppointment({ id: "apt-1", professionalProfileId: "prof-1" })
      const apt2 = makeAppointment({ id: "apt-2", professionalProfileId: "prof-2" })
      mockPrisma.appointment.findMany.mockResolvedValue([apt1, apt2])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
        { id: "prof-2", user: { name: "Dr. Bruno" } },
      ])

      mockGeneratePerSessionInvoices.mockResolvedValue({ generated: 2, updated: 1, skipped: 0 })
      const patient = makePatient({ splitInvoiceByProfessional: true })

      const result = await generateInvoicesForPatient(defaultParams({ patient }))

      expect(result).toEqual({ generated: 4, updated: 2, skipped: 0 })
    })
  })

  describe("due date calculation", () => {
    it("uses patient invoiceDueDay when available for monthly invoices", async () => {
      mockResolveGrouping.mockReturnValue("MONTHLY")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const patient = makePatient({ invoiceDueDay: 25 })
      await generateInvoicesForPatient(defaultParams({ patient }))

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(callParams.dueDate).toEqual(new Date(Date.UTC(2026, 2, 25, 12)))
    })

    it("falls back to clinic invoiceDueDay when patient invoiceDueDay is null", async () => {
      mockResolveGrouping.mockReturnValue("MONTHLY")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const patient = makePatient({ invoiceDueDay: null })
      const clinic = makeClinic({ invoiceDueDay: 10 })
      await generateInvoicesForPatient(defaultParams({ patient, clinic }))

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(callParams.dueDate).toEqual(new Date(Date.UTC(2026, 2, 10, 12)))
    })

    it("defaults to day 15 when both patient and clinic invoiceDueDay are null", async () => {
      mockResolveGrouping.mockReturnValue("MONTHLY")
      const apt = makeAppointment()
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      const patient = makePatient({ invoiceDueDay: null })
      const clinic = makeClinic({ invoiceDueDay: null })
      await generateInvoicesForPatient(defaultParams({ patient, clinic }))

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(callParams.dueDate).toEqual(new Date(Date.UTC(2026, 2, 15, 12)))
    })
  })

  describe("appointment field mapping", () => {
    it("maps price to number and uses attendingProfessionalId fallback", async () => {
      const apt = makeAppointment({
        price: "150.50",
        attendingProfessionalId: "attending-prof-1",
      })
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      await generateInvoicesForPatient(defaultParams())

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      const mapped = callParams.appointments[0]
      expect(mapped.price).toBe(150.5)
      expect(mapped.attendingProfessionalId).toBe("attending-prof-1")
    })

    it("falls back to professionalProfileId when attendingProfessionalId is null", async () => {
      const apt = makeAppointment({
        price: null,
        attendingProfessionalId: null,
        professionalProfileId: "prof-1",
      })
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        { id: "prof-1", user: { name: "Dr. Ana" } },
      ])

      await generateInvoicesForPatient(defaultParams())

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      const mapped = callParams.appointments[0]
      expect(mapped.price).toBeNull()
      expect(mapped.attendingProfessionalId).toBe("prof-1")
    })
  })

  describe("professional name lookup", () => {
    it("uses empty string when professional is not found in profMap", async () => {
      const apt = makeAppointment({ professionalProfileId: "unknown-prof" })
      mockPrisma.appointment.findMany.mockResolvedValue([apt])
      mockPrisma.professionalProfile.findMany.mockResolvedValue([])

      await generateInvoicesForPatient(defaultParams())

      const callParams = mockGenerateMonthlyInvoice.mock.calls[0][1]
      expect(callParams.profName).toBe("")
    })
  })
})
