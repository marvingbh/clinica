import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("./recalculate-invoice", () => ({
  recalculateInvoice: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("./generate-per-session-invoices", () => ({
  generatePerSessionInvoices: vi.fn().mockResolvedValue({ generated: 1, updated: 0, skipped: 0 }),
}))
vi.mock("./generate-monthly-invoice", () => ({
  generateMonthlyInvoice: vi.fn().mockResolvedValue("generated"),
}))
vi.mock("./uninvoiced-appointments", () => ({
  fetchUninvoicedPriorAppointments: vi.fn().mockResolvedValue([]),
}))

import { recalculatePerSession, handleGroupingTransition } from "./recalculate-dispatch"
import { recalculateInvoice } from "./recalculate-invoice"
import { generatePerSessionInvoices } from "./generate-per-session-invoices"
import { generateMonthlyInvoice } from "./generate-monthly-invoice"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockTx(overrides = {}) {
  return {
    appointment: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    invoice: {
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    invoiceItem: {
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sessionCredit: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    professionalProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  }
}

function makePerSessionParams(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      id: "inv-1",
      patientId: "pat-1",
      professionalProfileId: "prof-1",
      referenceMonth: 4,
      referenceYear: 2026,
      dueDate: new Date("2026-04-15T12:00:00Z"),
      items: [
        { id: "item-1", appointmentId: "apt-1", type: "SESSAO_REGULAR", description: "Sessao" },
      ],
      ...((overrides.invoice as Record<string, unknown>) ?? {}),
    },
    patient: {
      name: "Joao Silva",
      motherName: "Maria Silva",
      fatherName: "Carlos Silva",
      sessionFee: 200,
      invoiceMessageTemplate: null as string | null,
      ...((overrides.patient as Record<string, unknown>) ?? {}),
    },
    clinicId: (overrides.clinicId as string) ?? "clinic-1",
  }
}

function makeGroupingParams(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      id: "inv-10",
      patientId: "pat-10",
      professionalProfileId: "prof-10",
      referenceMonth: 4,
      referenceYear: 2026,
      items: [] as Array<{ type: string; description: string; quantity: number; unitPrice: number; total: number }>,
      ...((overrides.invoice as Record<string, unknown>) ?? {}),
    },
    patient: {
      name: "Ana Costa",
      motherName: "Beth Costa",
      fatherName: "Rui Costa",
      sessionFee: 180,
      showAppointmentDaysOnInvoice: false,
      invoiceMessageTemplate: null as string | null,
      invoiceDueDay: null as number | null,
      ...((overrides.patient as Record<string, unknown>) ?? {}),
    },
    clinic: {
      invoiceDueDay: 15,
      invoiceMessageTemplate: null as string | null,
      billingMode: "PER_SESSION",
      invoiceGrouping: "PER_SESSION",
      ...((overrides.clinic as Record<string, unknown>) ?? {}),
    },
    clinicId: (overrides.clinicId as string) ?? "clinic-10",
    newGrouping: (overrides.newGrouping as "MONTHLY" | "PER_SESSION") ?? "PER_SESSION",
  }
}

// ---------------------------------------------------------------------------
// recalculatePerSession
// ---------------------------------------------------------------------------

describe("recalculatePerSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns noop when no items have an appointmentId", async () => {
    const params = makePerSessionParams({
      invoice: {
        id: "inv-noop-1",
        patientId: "pat-1",
        professionalProfileId: "prof-1",
        referenceMonth: 4,
        referenceYear: 2026,
        dueDate: new Date("2026-04-15T12:00:00Z"),
        items: [
          { id: "item-a", appointmentId: null, type: "SESSAO_REGULAR", description: "Sessao" },
        ],
      },
    })
    const tx = makeMockTx()

    const result = await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(result).toEqual({ action: "noop", message: "Fatura recalculada (sem item de sessão)" })
    expect(tx.appointment.findUnique).not.toHaveBeenCalled()
  })

  it("returns noop when only CREDITO items have appointmentId", async () => {
    const params = makePerSessionParams({
      invoice: {
        id: "inv-noop-2",
        patientId: "pat-1",
        professionalProfileId: "prof-1",
        referenceMonth: 4,
        referenceYear: 2026,
        dueDate: new Date("2026-04-15T12:00:00Z"),
        items: [
          { id: "item-c", appointmentId: "apt-99", type: "CREDITO", description: "Credito" },
        ],
      },
    })
    const tx = makeMockTx()

    const result = await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(result).toEqual({ action: "noop", message: "Fatura recalculada (sem item de sessão)" })
  })

  it("cancels invoice when appointment is not found", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue(null)
    const params = makePerSessionParams()

    const result = await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(result).toEqual({ action: "cancelled", message: "Fatura cancelada (sessão não faturável)" })
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "CANCELADO" },
    })
  })

  it("cancels invoice when appointment status is CANCELADO", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-1", status: "CANCELADO", price: null })
    const params = makePerSessionParams()

    const result = await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(result).toEqual({ action: "cancelled", message: "Fatura cancelada (sessão não faturável)" })
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "CANCELADO" },
    })
  })

  it("cancels invoice when appointment status is REMARCADO", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-1", status: "REMARCADO", price: null })
    const params = makePerSessionParams()

    const result = await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(result).toEqual({ action: "cancelled", message: "Fatura cancelada (sessão não faturável)" })
  })

  it.each(["AGENDADO", "CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA"])(
    "recalculates when appointment status is %s",
    async (status) => {
      const tx = makeMockTx()
      tx.appointment.findUnique.mockResolvedValue({ id: "apt-1", status, price: null })
      const params = makePerSessionParams()

      const result = await recalculatePerSession(tx as any, params, null, "Dra. Ana")

      expect(result).toEqual({ action: "recalculated", message: "Fatura recalculada com sucesso" })
    },
  )

  it("uses appointment.price when it exists", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-1", status: "FINALIZADO", price: 250 })
    const params = makePerSessionParams()

    await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(tx.invoiceItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { unitPrice: 250, total: 250 },
    })
  })

  it("falls back to patient.sessionFee when appointment.price is null", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-1", status: "FINALIZADO", price: null })
    const params = makePerSessionParams({ patient: { sessionFee: 175 } })

    await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(tx.invoiceItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { unitPrice: 175, total: 175 },
    })
  })

  it("applies available SessionCredit when invoice has no CREDITO item", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-2", status: "AGENDADO", price: null })
    tx.sessionCredit.findFirst.mockResolvedValue({ id: "credit-1", reason: "Falta justificada" })

    const params = makePerSessionParams({
      invoice: {
        id: "inv-credit",
        patientId: "pat-2",
        professionalProfileId: "prof-1",
        referenceMonth: 4,
        referenceYear: 2026,
        dueDate: new Date("2026-04-15T12:00:00Z"),
        items: [
          { id: "item-2", appointmentId: "apt-2", type: "SESSAO_REGULAR", description: "Sessao" },
        ],
      },
      patient: { sessionFee: 200 },
    })

    await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(tx.invoiceItem.create).toHaveBeenCalledWith({
      data: {
        invoiceId: "inv-credit",
        appointmentId: null,
        type: "CREDITO",
        description: "Crédito: Falta justificada",
        quantity: -1,
        unitPrice: 200,
        total: -200,
      },
    })
    expect(tx.sessionCredit.update).toHaveBeenCalledWith({
      where: { id: "credit-1" },
      data: { consumedByInvoiceId: "inv-credit", consumedAt: expect.any(Date) },
    })
  })

  it("does NOT apply credit when invoice already has a CREDITO item", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-3", status: "AGENDADO", price: null })

    const params = makePerSessionParams({
      invoice: {
        id: "inv-has-credit",
        patientId: "pat-3",
        professionalProfileId: "prof-1",
        referenceMonth: 4,
        referenceYear: 2026,
        dueDate: new Date("2026-04-15T12:00:00Z"),
        items: [
          { id: "item-3", appointmentId: "apt-3", type: "SESSAO_REGULAR", description: "Sessao" },
          { id: "item-4", appointmentId: null, type: "CREDITO", description: "Credito existente" },
        ],
      },
    })

    await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(tx.sessionCredit.findFirst).not.toHaveBeenCalled()
    expect(tx.invoiceItem.create).not.toHaveBeenCalled()
  })

  it("does not apply credit when no SessionCredit is available", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-4", status: "AGENDADO", price: null })
    tx.sessionCredit.findFirst.mockResolvedValue(null)

    const params = makePerSessionParams()

    await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(tx.sessionCredit.findFirst).toHaveBeenCalled()
    expect(tx.invoiceItem.create).not.toHaveBeenCalled()
  })

  it("queries SessionCredit scoped by clinicId and patientId", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-5", status: "FINALIZADO", price: null })
    tx.sessionCredit.findFirst.mockResolvedValue(null)

    const params = makePerSessionParams({
      clinicId: "clinic-scope",
      invoice: {
        id: "inv-scope",
        patientId: "pat-scope",
        professionalProfileId: "prof-1",
        referenceMonth: 4,
        referenceYear: 2026,
        dueDate: new Date("2026-04-15T12:00:00Z"),
        items: [
          { id: "item-5", appointmentId: "apt-5", type: "SESSAO_REGULAR", description: "Sessao" },
        ],
      },
    })

    await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(tx.sessionCredit.findFirst).toHaveBeenCalledWith({
      where: { clinicId: "clinic-scope", patientId: "pat-scope", consumedByInvoiceId: null },
      orderBy: { createdAt: "asc" },
    })
  })

  it("calls recalculateInvoice after updating items", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue({ id: "apt-6", status: "FINALIZADO", price: null })

    const params = makePerSessionParams()

    await recalculatePerSession(tx as any, params, "Clinic template", "Dra. Ana")

    expect(recalculateInvoice).toHaveBeenCalledWith(
      tx,
      "inv-1",
      expect.objectContaining({
        referenceMonth: 4,
        referenceYear: 2026,
        showAppointmentDays: false,
      }),
      params.patient,
      "Clinic template",
      "Dra. Ana",
    )
  })

  it("does not call recalculateInvoice when invoice is cancelled", async () => {
    const tx = makeMockTx()
    tx.appointment.findUnique.mockResolvedValue(null)

    const params = makePerSessionParams()

    await recalculatePerSession(tx as any, params, null, "Dra. Ana")

    expect(recalculateInvoice).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// handleGroupingTransition
// ---------------------------------------------------------------------------

describe("handleGroupingTransition", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("releases consumed SessionCredits from old invoice", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    const params = makeGroupingParams()

    await handleGroupingTransition(tx as any, params)

    expect(tx.sessionCredit.updateMany).toHaveBeenCalledWith({
      where: { consumedByInvoiceId: "inv-10" },
      data: { consumedByInvoiceId: null, consumedAt: null },
    })
  })

  it("cancels old invoice", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    const params = makeGroupingParams()

    await handleGroupingTransition(tx as any, params)

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-10" },
      data: { status: "CANCELADO" },
    })
  })

  it("calls generatePerSessionInvoices when newGrouping is PER_SESSION", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    const params = makeGroupingParams({ newGrouping: "PER_SESSION" })

    await handleGroupingTransition(tx as any, params)

    expect(generatePerSessionInvoices).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        clinicId: "clinic-10",
        patientId: "pat-10",
        profId: "prof-10",
        month: 4,
        year: 2026,
        sessionFee: 180,
        patientName: "Ana Costa",
        profName: "Dra. Bia",
      }),
    )
    expect(generateMonthlyInvoice).not.toHaveBeenCalled()
  })

  it("calls generateMonthlyInvoice when newGrouping is MONTHLY", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    const params = makeGroupingParams({ newGrouping: "MONTHLY" })

    await handleGroupingTransition(tx as any, params)

    expect(generateMonthlyInvoice).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        clinicId: "clinic-10",
        patientId: "pat-10",
        professionalProfileId: "prof-10",
        month: 4,
        year: 2026,
        sessionFee: 180,
        profName: "Dra. Bia",
      }),
    )
    expect(generatePerSessionInvoices).not.toHaveBeenCalled()
  })

  it("returns 'por sessão' for PER_SESSION transition", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue(null)
    const params = makeGroupingParams({ newGrouping: "PER_SESSION" })

    const result = await handleGroupingTransition(tx as any, params)

    expect(result).toBe("por sessão")
  })

  it("returns 'mensal' for MONTHLY transition", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue(null)
    const params = makeGroupingParams({ newGrouping: "MONTHLY" })

    const result = await handleGroupingTransition(tx as any, params)

    expect(result).toBe("mensal")
  })

  it("uses empty string as profName when professional not found", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue(null)
    const params = makeGroupingParams({ newGrouping: "PER_SESSION" })

    await handleGroupingTransition(tx as any, params)

    expect(generatePerSessionInvoices).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ profName: "" }),
    )
  })

  it("carries manual credits to the first new invoice", async () => {
    const tx = makeMockTx()
    // Auto-credit consumed by old invoice
    tx.sessionCredit.findMany.mockResolvedValue([
      { id: "sc-1", reason: "Falta justificada" },
    ])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    // Target invoice found for carrying credits
    tx.invoice.findFirst.mockResolvedValue({ id: "inv-new-1" })
    // Items after carry include the manual credit
    tx.invoiceItem.findMany.mockResolvedValue([
      { type: "SESSAO_REGULAR", total: 180 },
      { type: "CREDITO", total: -50 },
    ])

    const params = makeGroupingParams({
      invoice: {
        id: "inv-10",
        patientId: "pat-10",
        professionalProfileId: "prof-10",
        referenceMonth: 4,
        referenceYear: 2026,
        items: [
          // Auto credit matches "Crédito: Falta justificada" -> excluded from manual
          { type: "CREDITO", description: "Crédito: Falta justificada", quantity: -1, unitPrice: 180, total: -180 },
          // Manual credit does NOT match any auto-credit description -> carried
          { type: "CREDITO", description: "Desconto especial", quantity: -1, unitPrice: 50, total: -50 },
        ],
      },
    })

    await handleGroupingTransition(tx as any, params)

    // Only the manual credit should be carried
    expect(tx.invoiceItem.create).toHaveBeenCalledTimes(1)
    expect(tx.invoiceItem.create).toHaveBeenCalledWith({
      data: {
        invoiceId: "inv-new-1",
        appointmentId: null,
        type: "CREDITO",
        description: "Desconto especial",
        quantity: -1,
        unitPrice: 50,
        total: -50,
      },
    })
  })

  it("does not carry credits when all credits are auto-generated", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([
      { id: "sc-1", reason: "Cancelamento" },
    ])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })

    const params = makeGroupingParams({
      invoice: {
        id: "inv-10",
        patientId: "pat-10",
        professionalProfileId: "prof-10",
        referenceMonth: 4,
        referenceYear: 2026,
        items: [
          { type: "CREDITO", description: "Crédito: Cancelamento", quantity: -1, unitPrice: 180, total: -180 },
        ],
      },
    })

    await handleGroupingTransition(tx as any, params)

    // No manual credits, so no carryManualCredits call -> no findFirst for target invoice
    expect(tx.invoice.findFirst).not.toHaveBeenCalled()
    expect(tx.invoiceItem.create).not.toHaveBeenCalled()
  })

  it("auto-pays new invoice when totalAmount <= 0 after manual credits", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    tx.invoice.findFirst.mockResolvedValue({ id: "inv-new-2" })
    // After carrying credits: total is negative
    tx.invoiceItem.findMany.mockResolvedValue([
      { type: "SESSAO_REGULAR", total: 100 },
      { type: "CREDITO", total: -150 },
    ])

    const params = makeGroupingParams({
      invoice: {
        id: "inv-10",
        patientId: "pat-10",
        professionalProfileId: "prof-10",
        referenceMonth: 4,
        referenceYear: 2026,
        items: [
          { type: "CREDITO", description: "Desconto generoso", quantity: -1, unitPrice: 150, total: -150 },
        ],
      },
    })

    await handleGroupingTransition(tx as any, params)

    // Second invoice.update call (first is cancel old invoice) updates target with auto-pay
    const updateCalls = tx.invoice.update.mock.calls
    const targetUpdate = updateCalls.find(
      (c: any[]) => c[0].where.id === "inv-new-2",
    )
    expect(targetUpdate).toBeDefined()
    expect(targetUpdate![0].data).toEqual(
      expect.objectContaining({
        totalAmount: -50,
        creditsApplied: 1,
        status: "PAGO",
        paidAt: expect.any(Date),
      }),
    )
  })

  it("does NOT auto-pay when totalAmount > 0 after manual credits", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    tx.invoice.findFirst.mockResolvedValue({ id: "inv-new-3" })
    tx.invoiceItem.findMany.mockResolvedValue([
      { type: "SESSAO_REGULAR", total: 200 },
      { type: "CREDITO", total: -50 },
    ])

    const params = makeGroupingParams({
      invoice: {
        id: "inv-10",
        patientId: "pat-10",
        professionalProfileId: "prof-10",
        referenceMonth: 4,
        referenceYear: 2026,
        items: [
          { type: "CREDITO", description: "Desconto parcial", quantity: -1, unitPrice: 50, total: -50 },
        ],
      },
    })

    await handleGroupingTransition(tx as any, params)

    const targetUpdate = tx.invoice.update.mock.calls.find(
      (c: any[]) => c[0].where.id === "inv-new-3",
    )
    expect(targetUpdate).toBeDefined()
    expect(targetUpdate![0].data.totalAmount).toBe(150)
    expect(targetUpdate![0].data.status).toBeUndefined()
    expect(targetUpdate![0].data.paidAt).toBeUndefined()
  })

  it("does not carry manual credits when no target invoice is found", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue(null)
    tx.invoice.findFirst.mockResolvedValue(null) // no target invoice

    const params = makeGroupingParams({
      invoice: {
        id: "inv-10",
        patientId: "pat-10",
        professionalProfileId: "prof-10",
        referenceMonth: 4,
        referenceYear: 2026,
        items: [
          { type: "CREDITO", description: "Desconto manual", quantity: -1, unitPrice: 50, total: -50 },
        ],
      },
    })

    await handleGroupingTransition(tx as any, params)

    expect(tx.invoiceItem.create).not.toHaveBeenCalled()
  })

  it("includes uninvoiced prior appointments in the appointments passed to generators", async () => {
    const { fetchUninvoicedPriorAppointments } = await import("./uninvoiced-appointments")
    const mockedFetch = vi.mocked(fetchUninvoicedPriorAppointments)

    const priorApt = {
      id: "apt-prior-1",
      scheduledAt: new Date("2026-03-20T10:00:00Z"),
      status: "FINALIZADO",
      type: "CONSULTA",
      title: null,
      recurrenceId: null,
      groupId: null,
      sessionGroupId: null,
      price: 150,
    }
    mockedFetch.mockResolvedValueOnce([priorApt])

    const tx = makeMockTx()
    tx.appointment.findMany.mockResolvedValue([])
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })

    const params = makeGroupingParams({ newGrouping: "PER_SESSION" })

    await handleGroupingTransition(tx as any, params)

    expect(generatePerSessionInvoices).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        appointments: expect.arrayContaining([
          expect.objectContaining({ id: "apt-prior-1", price: 150 }),
        ]),
      }),
    )
  })

  it("uses patient.invoiceDueDay for MONTHLY dueDate when set", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    const params = makeGroupingParams({
      newGrouping: "MONTHLY",
      patient: { invoiceDueDay: 20 },
    })

    await handleGroupingTransition(tx as any, params)

    expect(generateMonthlyInvoice).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        dueDate: expect.any(Date),
      }),
    )
    const callArgs = vi.mocked(generateMonthlyInvoice).mock.calls[0][1] as any
    expect(callArgs.dueDate.getUTCDate()).toBe(20)
  })

  it("falls back to clinic.invoiceDueDay when patient.invoiceDueDay is null", async () => {
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })
    const params = makeGroupingParams({
      newGrouping: "MONTHLY",
      patient: { invoiceDueDay: null },
      clinic: { invoiceDueDay: 25 },
    })

    await handleGroupingTransition(tx as any, params)

    const callArgs = vi.mocked(generateMonthlyInvoice).mock.calls[0][1] as any
    expect(callArgs.dueDate.getUTCDate()).toBe(25)
  })

  it("queries consumed credits BEFORE releasing them", async () => {
    const callOrder: string[] = []
    const tx = makeMockTx()
    tx.sessionCredit.findMany.mockImplementation(async () => {
      callOrder.push("findMany")
      return [{ id: "sc-1", reason: "Auto" }]
    })
    tx.sessionCredit.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany")
      return {}
    })
    tx.professionalProfile.findUnique.mockResolvedValue(null)

    const params = makeGroupingParams()
    await handleGroupingTransition(tx as any, params)

    expect(callOrder.indexOf("findMany")).toBeLessThan(callOrder.indexOf("updateMany"))
  })

  it("maps appointment prices to numbers for generators", async () => {
    const tx = makeMockTx()
    tx.appointment.findMany.mockResolvedValue([
      {
        id: "apt-dec",
        scheduledAt: new Date("2026-04-05"),
        status: "FINALIZADO",
        type: "CONSULTA",
        title: null,
        recurrenceId: null,
        groupId: null,
        sessionGroupId: null,
        price: { valueOf: () => 199.99, toNumber: () => 199.99 },
      },
    ])
    tx.sessionCredit.findMany.mockResolvedValue([])
    tx.professionalProfile.findUnique.mockResolvedValue({ user: { name: "Dra. Bia" } })

    const params = makeGroupingParams({ newGrouping: "PER_SESSION" })
    await handleGroupingTransition(tx as any, params)

    expect(generatePerSessionInvoices).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        appointments: expect.arrayContaining([
          expect.objectContaining({ id: "apt-dec", price: 199.99 }),
        ]),
      }),
    )
  })
})
