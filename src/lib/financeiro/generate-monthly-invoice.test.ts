import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateMonthlyInvoice, MonthlyInvoiceParams } from "./generate-monthly-invoice"

// Mock recalculateInvoice since it's also tx-dependent
vi.mock("./recalculate-invoice", () => ({
  recalculateInvoice: vi.fn(),
}))

function makeApt(overrides: Partial<MonthlyInvoiceParams["appointments"][0]> & { id: string; scheduledAt: Date }) {
  return {
    status: "CONFIRMADO",
    type: "CONSULTA" as const,
    title: null,
    recurrenceId: "rec-1",
    groupId: null,
    price: null,
    ...overrides,
  }
}

function makeParams(overrides: Partial<MonthlyInvoiceParams> = {}): MonthlyInvoiceParams {
  return {
    clinicId: "clinic-1",
    patientId: "patient-1",
    professionalProfileId: "prof-1",
    month: 3,
    year: 2026,
    dueDate: new Date("2026-03-10T12:00:00Z"),
    sessionFee: 200,
    showAppointmentDays: true,
    profName: "Dr. Ana",
    billingMode: "PER_SESSION",
    patient: {
      name: "João",
      motherName: "Maria",
      fatherName: "José",
      invoiceMessageTemplate: null,
    },
    clinicInvoiceMessageTemplate: null,
    appointments: [],
    ...overrides,
  }
}

function createMockTx() {
  const createdInvoices: { id: string; data: Record<string, unknown> }[] = []
  let invoiceCounter = 0

  return {
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
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
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    sessionCredit: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    _createdInvoices: createdInvoices,
  }
}

describe("generateMonthlyInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("new invoice creation", () => {
    it("creates a monthly invoice with correct fields", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      const result = await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      expect(result).toBe("generated")
      expect(tx.invoice.create).toHaveBeenCalledTimes(1)

      const createCall = tx.invoice.create.mock.calls[0][0]
      expect(createCall.data.clinicId).toBe("clinic-1")
      expect(createCall.data.patientId).toBe("patient-1")
      expect(createCall.data.professionalProfileId).toBe("prof-1")
      expect(createCall.data.referenceMonth).toBe(3)
      expect(createCall.data.referenceYear).toBe(2026)
      expect(createCall.data.totalSessions).toBe(2)
    })

    it("creates items linked to appointments", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const items = createCall.data.items.create
      expect(items.length).toBeGreaterThanOrEqual(1)
      expect(items[0].appointmentId).toBe("a1")
    })

    it("includes credits in the invoice", async () => {
      const tx = createMockTx()
      tx.sessionCredit.findMany.mockResolvedValueOnce([
        { id: "credit-1", reason: "Cancelamento 01/03", createdAt: new Date() },
      ])

      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const items = createCall.data.items.create
      const creditItem = items.find((i: { type: string }) => i.type === "CREDITO")
      expect(creditItem).toBeTruthy()
      expect(creditItem.total).toBe(-200)

      // Credit should be marked as consumed
      expect(tx.sessionCredit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "credit-1" },
          data: expect.objectContaining({ consumedByInvoiceId: expect.any(String) }),
        })
      )
    })

    it("calculates total amount correctly with credits", async () => {
      const tx = createMockTx()
      tx.sessionCredit.findMany.mockResolvedValueOnce([
        { id: "credit-1", reason: "Cancel", createdAt: new Date() },
      ])

      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      // 2 sessions * 200 - 1 credit * 200 = 200
      expect(createCall.data.totalAmount).toBe(200)
    })
  })

  describe("conflicting invoice cancellation", () => {
    it("cancels PENDENTE PER_SESSION invoices for same patient+month", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([
        { id: "ps-inv-1" },
        { id: "ps-inv-2" },
      ])
      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      expect(tx.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoiceType: "PER_SESSION",
            status: "PENDENTE",
          }),
        })
      )
      expect(tx.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["ps-inv-1", "ps-inv-2"] } },
        data: { status: "CANCELADO" },
      })
    })

    it("releases credits consumed by cancelled PER_SESSION invoices", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([{ id: "ps-inv-1" }])

      await generateMonthlyInvoice(tx, makeParams({
        appointments: [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })],
      }))

      expect(tx.sessionCredit.updateMany).toHaveBeenCalledWith({
        where: { consumedByInvoiceId: { in: ["ps-inv-1"] } },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })
    })

    it("does nothing when no conflicting invoices exist", async () => {
      const tx = createMockTx()
      tx.invoice.findMany.mockResolvedValueOnce([])

      await generateMonthlyInvoice(tx, makeParams({
        appointments: [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })],
      }))

      expect(tx.invoice.updateMany).not.toHaveBeenCalled()
    })
  })

  describe("existing MONTHLY invoice", () => {
    it("skips when existing invoice is PAGO", async () => {
      const tx = createMockTx()
      tx.invoice.findFirst.mockResolvedValueOnce({
        id: "existing-1",
        status: "PAGO",
        items: [],
      })

      const result = await generateMonthlyInvoice(tx, makeParams({
        appointments: [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })],
      }))

      expect(result).toBe("skipped")
      expect(tx.invoice.create).not.toHaveBeenCalled()
    })

    it("skips when existing invoice is ENVIADO", async () => {
      const tx = createMockTx()
      tx.invoice.findFirst.mockResolvedValueOnce({
        id: "existing-1",
        status: "ENVIADO",
        items: [],
      })

      const result = await generateMonthlyInvoice(tx, makeParams({
        appointments: [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })],
      }))

      expect(result).toBe("skipped")
    })

    it("skips when existing invoice is PARCIAL", async () => {
      const tx = createMockTx()
      tx.invoice.findFirst.mockResolvedValueOnce({
        id: "existing-1",
        status: "PARCIAL",
        items: [],
      })

      const result = await generateMonthlyInvoice(tx, makeParams({
        appointments: [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })],
      }))

      expect(result).toBe("skipped")
    })

    it("updates existing PENDENTE invoice", async () => {
      const tx = createMockTx()
      tx.invoice.findFirst.mockResolvedValueOnce({
        id: "existing-1",
        status: "PENDENTE",
        referenceMonth: 3,
        referenceYear: 2026,
        dueDate: new Date("2026-03-10T12:00:00Z"),
        showAppointmentDays: true,
        items: [
          { id: "item-1", appointmentId: "old-apt-1", type: "SESSAO_REGULAR", description: "Sessão" },
        ],
      })
      // consumedCredits query returns empty
      tx.sessionCredit.findMany
        .mockResolvedValueOnce([]) // consumed credits for existing
        .mockResolvedValueOnce([]) // available credits

      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      const result = await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      expect(result).toBe("updated")
      expect(tx.invoice.create).not.toHaveBeenCalled()
      // Old auto items should be deleted
      expect(tx.invoiceItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["item-1"] } },
      })
      // New items should be created
      expect(tx.invoiceItem.create).toHaveBeenCalled()
    })

    it("preserves manual items when updating", async () => {
      const tx = createMockTx()
      tx.invoice.findFirst.mockResolvedValueOnce({
        id: "existing-1",
        status: "PENDENTE",
        referenceMonth: 3,
        referenceYear: 2026,
        dueDate: new Date("2026-03-10T12:00:00Z"),
        showAppointmentDays: true,
        items: [
          { id: "auto-1", appointmentId: "apt-1", type: "SESSAO_REGULAR", description: "Sessão" },
          { id: "manual-1", appointmentId: null, type: "CREDITO", description: "Desconto manual" },
        ],
      })
      tx.sessionCredit.findMany
        .mockResolvedValueOnce([]) // consumed credits
        .mockResolvedValueOnce([]) // available credits

      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      // Only auto items should be deleted, not manual ones
      expect(tx.invoiceItem.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["auto-1"] } },
      })
    })
  })

  describe("double-billing prevention", () => {
    it("excludes appointments already invoiced elsewhere", async () => {
      const tx = createMockTx()
      tx.invoice.findFirst.mockResolvedValueOnce(null) // no existing monthly
      // Appointment a1 is already invoiced on another invoice
      tx.invoiceItem.findMany.mockResolvedValueOnce([
        { appointmentId: "a1" },
      ])

      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z") }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      // Only a2 should be in the items (a1 is already invoiced)
      const aptIds = createCall.data.items.create
        .filter((i: { appointmentId: string | null }) => i.appointmentId !== null)
        .map((i: { appointmentId: string }) => i.appointmentId)
      expect(aptIds).not.toContain("a1")
      expect(aptIds).toContain("a2")
    })
  })

  describe("appointment classification", () => {
    it("classifies regular recurring appointments", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), recurrenceId: "rec-1" }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const items = createCall.data.items.create
      expect(items[0].type).toBe("SESSAO_REGULAR")
    })

    it("classifies extra appointments (no recurrence)", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), recurrenceId: null }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const items = createCall.data.items.create
      expect(items[0].type).toBe("SESSAO_EXTRA")
    })

    it("classifies group appointments", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), groupId: "g1", recurrenceId: null }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      const items = createCall.data.items.create
      expect(items[0].type).toBe("SESSAO_GRUPO")
    })

    it("excludes non-billable statuses", async () => {
      const tx = createMockTx()
      const apts = [
        makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z"), status: "CANCELADO_PROFISSIONAL" }),
        makeApt({ id: "a2", scheduledAt: new Date("2026-03-12T10:00:00Z"), status: "CONFIRMADO" }),
      ]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      expect(createCall.data.totalSessions).toBe(1)
    })
  })

  describe("message body", () => {
    it("generates message body with patient and invoice info", async () => {
      const tx = createMockTx()
      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      await generateMonthlyInvoice(tx, makeParams({ appointments: apts }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      expect(createCall.data.messageBody).toBeTruthy()
      expect(createCall.data.messageBody).toContain("João")
    })

    it("uses patient template when available", async () => {
      const tx = createMockTx()
      const apts = [makeApt({ id: "a1", scheduledAt: new Date("2026-03-05T10:00:00Z") })]

      await generateMonthlyInvoice(tx, makeParams({
        appointments: apts,
        patient: {
          name: "João",
          motherName: null,
          fatherName: null,
          invoiceMessageTemplate: "Custom: {{paciente}} - {{valor}}",
        },
      }))

      const createCall = tx.invoice.create.mock.calls[0][0]
      expect(createCall.data.messageBody).toContain("Custom: João")
    })
  })
})
