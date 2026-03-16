import { describe, it, expect, vi, beforeEach } from "vitest"
import { generatePerSessionInvoices, PerSessionInvoiceParams } from "./generate-per-session-invoices"
import type { AppointmentForInvoice } from "./invoice-generator"

// Mock recalculateInvoice since it's also tx-dependent
vi.mock("./recalculate-invoice", () => ({
  recalculateInvoice: vi.fn(),
}))

function makeApt(overrides: Partial<AppointmentForInvoice> & { id: string; scheduledAt: Date }): AppointmentForInvoice {
  return {
    status: "CONFIRMADO",
    type: "CONSULTA",
    title: null,
    recurrenceId: "rec-1",
    groupId: null,
    sessionGroupId: null,
    price: null,
    ...overrides,
  }
}

function makeParams(overrides: Partial<PerSessionInvoiceParams> = {}): PerSessionInvoiceParams {
  return {
    clinicId: "clinic-1",
    patientId: "patient-1",
    profId: "prof-1",
    month: 3,
    year: 2026,
    appointments: [],
    sessionFee: 200,
    patientTemplate: null,
    clinicTemplate: null,
    clinicPaymentInfo: null,
    profName: "Dr. Ana",
    patientName: "João",
    motherName: "Maria",
    fatherName: "José",
    showAppointmentDays: true,
    ...overrides,
  }
}

function createMockTx() {
  const createdInvoices: { id: string; data: Record<string, unknown> }[] = []
  let invoiceCounter = 0

  return {
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(({ data }) => {
        invoiceCounter++
        const inv = { id: `inv-${invoiceCounter}`, ...data }
        createdInvoices.push({ id: inv.id, data })
        return Promise.resolve(inv)
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    invoiceItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    sessionCredit: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    _createdInvoices: createdInvoices,
  }
}

describe("generatePerSessionInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns zeros when no appointments", async () => {
    const tx = createMockTx()
    const result = await generatePerSessionInvoices(tx, makeParams())

    expect(result).toEqual({ generated: 0, updated: 0, skipped: 0 })
  })

  it("creates one invoice per billable appointment", async () => {
    const tx = createMockTx()
    const apts = [
      makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
      makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      makeApt({ id: "a3", scheduledAt: new Date("2026-03-19T10:00:00Z") }),
    ]

    const result = await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

    expect(result.generated).toBe(3)
    expect(tx.invoice.create).toHaveBeenCalledTimes(3)
  })

  it("creates invoices with PER_SESSION type and correct data", async () => {
    const tx = createMockTx()
    const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

    await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

    const createCall = tx.invoice.create.mock.calls[0][0]
    expect(createCall.data.invoiceType).toBe("PER_SESSION")
    expect(createCall.data.clinicId).toBe("clinic-1")
    expect(createCall.data.patientId).toBe("patient-1")
    expect(createCall.data.professionalProfileId).toBe("prof-1")
    expect(createCall.data.totalAmount).toBe(200)
    expect(createCall.data.totalSessions).toBe(1)
    expect(createCall.data.status).toBe("PENDENTE")
  })

  it("sorts appointments by date before processing", async () => {
    const tx = createMockTx()
    const apts = [
      makeApt({ id: "a-later", scheduledAt: new Date("2026-03-19T10:00:00Z") }),
      makeApt({ id: "a-earlier", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
    ]

    await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

    // First create call should be for the earlier appointment
    const firstCall = tx.invoice.create.mock.calls[0][0]
    expect(firstCall.data.items.create[0].appointmentId).toBe("a-earlier")
  })

  it("uses appointment custom price when set", async () => {
    const tx = createMockTx()
    const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), price: 300 })]

    await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

    const createCall = tx.invoice.create.mock.calls[0][0]
    expect(createCall.data.totalAmount).toBe(300)
  })

  describe("conflicting invoice cancellation", () => {
    it("cancels PENDENTE MONTHLY invoices for same patient+month", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([{ id: "monthly-inv-1" }])
      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      expect(tx.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoiceType: { not: "PER_SESSION" },
            status: "PENDENTE",
          }),
        })
      )
      expect(tx.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["monthly-inv-1"] } },
        data: { status: "CANCELADO" },
      })
    })

    it("releases credits consumed by conflicting invoices", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([{ id: "monthly-inv-1" }])

      await generatePerSessionInvoices(tx, makeParams({
        appointments: [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })],
      }))

      expect(tx.sessionCredit.updateMany).toHaveBeenCalledWith({
        where: { consumedByInvoiceId: { in: ["monthly-inv-1"] } },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })
    })

    it("does not cancel anything when no conflicting invoices exist", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([]) // no conflicts

      await generatePerSessionInvoices(tx, makeParams({
        appointments: [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })],
      }))

      expect(tx.invoice.updateMany).not.toHaveBeenCalled()
      expect(tx.sessionCredit.updateMany).not.toHaveBeenCalled()
    })
  })

  describe("already invoiced appointments", () => {
    it("skips appointments invoiced on non-PER_SESSION invoices", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([]) // no conflicts
      tx.invoiceItem.findMany.mockResolvedValueOnce([
        { appointmentId: "a1", invoice: { invoiceType: "MONTHLY" } },
      ])

      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      const result = await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      expect(result.generated).toBe(1)
      expect(tx.invoice.create).toHaveBeenCalledTimes(1)
    })
  })

  describe("credit consumption", () => {
    it("applies available credits to invoices", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([]) // no conflicts
      tx.sessionCredit.findMany.mockResolvedValueOnce([
        { id: "credit-1", reason: "Cancelamento 01/03", createdAt: new Date() },
      ])

      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      // First invoice should get the credit
      const firstCreate = tx.invoice.create.mock.calls[0][0]
      const creditItem = firstCreate.data.items.create.find(
        (i: { type: string }) => i.type === "CREDITO"
      )
      expect(creditItem).toBeTruthy()
      expect(creditItem.total).toBe(-200) // -sessionFee

      // Credit should be marked as consumed
      expect(tx.sessionCredit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "credit-1" },
          data: expect.objectContaining({ consumedByInvoiceId: expect.any(String) }),
        })
      )
    })

    it("marks invoice as PAGO when credit covers full amount", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([])
      tx.sessionCredit.findMany.mockResolvedValueOnce([
        { id: "credit-1", reason: "Cancelamento", createdAt: new Date() },
      ])

      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      expect(createCall.data.totalAmount).toBe(0)
      expect(createCall.data.status).toBe("PAGO")
      expect(createCall.data.paidAt).toBeTruthy()
    })

    it("does not apply more credits than appointments", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([])
      tx.sessionCredit.findMany.mockResolvedValueOnce([
        { id: "credit-1", reason: "Cancel 1", createdAt: new Date() },
        { id: "credit-2", reason: "Cancel 2", createdAt: new Date() },
        { id: "credit-3", reason: "Cancel 3", createdAt: new Date() },
      ])

      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      // Only 2 credits should be consumed (one per appointment)
      expect(tx.sessionCredit.update).toHaveBeenCalledTimes(2)
    })
  })

  describe("existing PER_SESSION invoices", () => {
    it("skips appointments with PAGO invoices", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([])
      // First apt has existing PAGO invoice, second is new
      tx.invoiceItem.findFirst
        .mockResolvedValueOnce({ invoice: { id: "existing-1", status: "PAGO" } })
        .mockResolvedValueOnce(null)

      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      const result = await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      expect(result.skipped).toBe(1)
      expect(result.generated).toBe(1)
    })

    it("updates existing PENDENTE invoices", async () => {
      const { recalculateInvoice } = await import("./recalculate-invoice")
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([])
      tx.invoiceItem.findFirst.mockResolvedValueOnce({
        invoice: { id: "existing-1", status: "PENDENTE" },
      })

      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      const result = await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      expect(result.updated).toBe(1)
      expect(recalculateInvoice).toHaveBeenCalledWith(
        tx,
        "existing-1",
        expect.any(Object),
        expect.objectContaining({ name: "João" }),
        null,
        "Dr. Ana",
      )
    })
  })

  describe("non-billable appointments", () => {
    it("processes all appointments passed in (filtering is upstream)", async () => {
      const tx = createMockTx()
      // The function creates invoices for all appointments it receives.
      // Non-billable filtering (by status) happens at the API route level.
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), status: "CANCELADO_PROFISSIONAL" }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z"), status: "CONFIRMADO" }),
      ]

      const result = await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      // Both get invoices — the classification just affects the item type label
      expect(result.generated).toBe(2)
    })
  })

  describe("appointment type classification", () => {
    it("classifies group appointments correctly", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), groupId: "group-1", recurrenceId: null }),
      ]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const sessionItem = createCall.data.items.create.find(
        (i: { type: string }) => i.type !== "CREDITO"
      )
      expect(sessionItem.type).toBe("SESSAO_GRUPO")
    })

    it("classifies extra appointments (no recurrence)", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), recurrenceId: null }),
      ]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const sessionItem = createCall.data.items.create.find(
        (i: { type: string }) => i.type !== "CREDITO"
      )
      expect(sessionItem.type).toBe("SESSAO_EXTRA")
    })

    it("classifies school meeting (REUNIAO type)", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({
          id: "a1",
          scheduledAt: new Date("2026-03-05T10:00:00Z"),
          type: "REUNIAO",
          recurrenceId: null,
          title: "Reunião com a escola",
        }),
      ]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const sessionItem = createCall.data.items.create.find(
        (i: { type: string }) => i.type !== "CREDITO"
      )
      expect(sessionItem.type).toBe("REUNIAO_ESCOLA")
    })
  })

  describe("due date and reference month", () => {
    it("sets due date to appointment date at noon UTC", async () => {
      const tx = createMockTx()
      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-15T14:30:00Z") })]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const dueDate = createCall.data.dueDate
      expect(dueDate.getUTCHours()).toBe(12)
      expect(dueDate.getUTCDate()).toBe(15)
      expect(dueDate.getUTCMonth()).toBe(2) // March = 2
    })

    it("uses appointment's month for reference (not params month)", async () => {
      const tx = createMockTx()
      // Appointment in April but params say March — reference should follow appointment
      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-04-02T10:00:00Z") })]

      await generatePerSessionInvoices(tx, makeParams({ appointments: apts, month: 3 }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      expect(createCall.data.referenceMonth).toBe(4)
    })
  })
})
