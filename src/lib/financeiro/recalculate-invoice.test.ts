import { describe, it, expect, vi } from "vitest"
import { recalculateInvoice, _internal } from "./recalculate-invoice"

const { descriptionWithDate } = _internal

// ---------------------------------------------------------------------------
// descriptionWithDate (pure function)
// ---------------------------------------------------------------------------

describe("descriptionWithDate", () => {
  it("returns description as-is when appointmentDate is null", () => {
    expect(descriptionWithDate("Sessão", null)).toBe("Sessão")
  })

  it("appends DD/MM when description has no date", () => {
    const date = new Date("2026-03-05T14:00:00Z")
    const result = descriptionWithDate("Sessão", date)
    expect(result).toBe("Sessão - 05/03")
  })

  it("returns description as-is when it already contains DD/MM pattern", () => {
    const date = new Date("2026-03-05T14:00:00Z")
    expect(descriptionWithDate("Sessão - 01/03", date)).toBe("Sessão - 01/03")
  })

  it("detects date pattern anywhere in the string", () => {
    const date = new Date("2026-04-10T10:00:00Z")
    expect(descriptionWithDate("15/02 Sessão remarcada", date)).toBe("15/02 Sessão remarcada")
  })

  it("does not treat single digits as a date pattern", () => {
    const date = new Date("2026-06-15T10:00:00Z")
    // "1/3" does not match \d{2}/\d{2}, so date should be appended
    const result = descriptionWithDate("Sessão 1/3", date)
    expect(result).toBe("Sessão 1/3 - 15/06")
  })
})

// ---------------------------------------------------------------------------
// recalculateInvoice (integration with mocked tx)
// ---------------------------------------------------------------------------

function makeMockTx(items: Record<string, unknown>[]) {
  return {
    invoiceItem: {
      findMany: vi.fn().mockResolvedValue(items),
    },
    invoice: {
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

const baseInvoice = {
  referenceMonth: 3,
  referenceYear: 2026,
  dueDate: new Date("2026-04-10T00:00:00Z"),
  showAppointmentDays: true,
}

const basePatient = {
  name: "João Silva",
  motherName: "Maria Silva",
  fatherName: "Carlos Silva",
  sessionFee: 150,
  invoiceMessageTemplate: null as string | null,
}

describe("recalculateInvoice", () => {
  it("updates invoice with zero totals when there are no items", async () => {
    const tx = makeMockTx([])
    await recalculateInvoice(tx, "inv-1", baseInvoice, basePatient, null, "Dra. Ana")

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: expect.objectContaining({
        totalSessions: 0,
        creditsApplied: 0,
        extrasAdded: 0,
        totalAmount: 0,
      }),
    })
  })

  it("counts SESSAO_REGULAR items correctly", async () => {
    const items = [
      { type: "SESSAO_REGULAR", quantity: 1, total: 150, description: "Sessão", appointment: { scheduledAt: new Date("2026-03-05") } },
      { type: "SESSAO_REGULAR", quantity: 1, total: 150, description: "Sessão", appointment: { scheduledAt: new Date("2026-03-12") } },
    ]
    const tx = makeMockTx(items)
    await recalculateInvoice(tx, "inv-1", baseInvoice, basePatient, null, "Dra. Ana")

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: expect.objectContaining({
        totalSessions: 2,
        creditsApplied: 0,
        extrasAdded: 0,
        totalAmount: 300,
      }),
    })
  })

  it("counts CREDITO items separately (not as sessions)", async () => {
    const items = [
      { type: "SESSAO_REGULAR", quantity: 1, total: 150, description: "Sessão", appointment: null },
      { type: "CREDITO", quantity: 1, total: -150, description: "Crédito", appointment: null },
    ]
    const tx = makeMockTx(items)
    await recalculateInvoice(tx, "inv-1", baseInvoice, basePatient, null, "Dra. Ana")

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: expect.objectContaining({
        totalSessions: 1,
        creditsApplied: 1,
        totalAmount: 0,
      }),
    })
  })

  it("counts SESSAO_EXTRA and REUNIAO_ESCOLA as extrasAdded", async () => {
    const items = [
      { type: "SESSAO_EXTRA", quantity: 2, total: 300, description: "Extra", appointment: null },
      { type: "REUNIAO_ESCOLA", quantity: 1, total: 150, description: "Reunião escola", appointment: null },
    ]
    const tx = makeMockTx(items)
    await recalculateInvoice(tx, "inv-1", baseInvoice, basePatient, null, "Dra. Ana")

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: expect.objectContaining({
        totalSessions: 3,
        extrasAdded: 3,
        totalAmount: 450,
      }),
    })
  })

  it("counts SESSAO_GRUPO in totalSessions but not in extrasAdded", async () => {
    const items = [
      { type: "SESSAO_GRUPO", quantity: 2, total: 200, description: "Grupo", appointment: null },
    ]
    const tx = makeMockTx(items)
    await recalculateInvoice(tx, "inv-1", baseInvoice, basePatient, null, "Dra. Ana")

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: expect.objectContaining({
        totalSessions: 2,
        extrasAdded: 0,
      }),
    })
  })

  it("uses patient template over clinic template and default", async () => {
    const patient = {
      ...basePatient,
      invoiceMessageTemplate: "Custom: {{paciente}} {{valor}}",
    }
    const tx = makeMockTx([
      { type: "SESSAO_REGULAR", quantity: 1, total: 150, description: "Sessão", appointment: null },
    ])
    await recalculateInvoice(tx, "inv-1", baseInvoice, patient, "Clinic tmpl: {{paciente}}", "Dra. Ana")

    const updateCall = tx.invoice.update.mock.calls[0][0]
    expect(updateCall.data.messageBody).toContain("Custom: João Silva")
    expect(updateCall.data.messageBody).not.toContain("Clinic tmpl")
  })

  it("falls back to clinic template when patient template is null", async () => {
    const tx = makeMockTx([
      { type: "SESSAO_REGULAR", quantity: 1, total: 150, description: "Sessão", appointment: null },
    ])
    await recalculateInvoice(tx, "inv-1", baseInvoice, basePatient, "Clinic: {{paciente}}", "Dra. Ana")

    const updateCall = tx.invoice.update.mock.calls[0][0]
    expect(updateCall.data.messageBody).toContain("Clinic: João Silva")
  })

  it("handles sessionFee as null by treating it as zero", async () => {
    const patient = {
      ...basePatient,
      sessionFee: null,
    }
    const tx = makeMockTx([
      { type: "SESSAO_REGULAR", quantity: 1, total: 200, description: "Sessão", appointment: null },
    ])
    await recalculateInvoice(tx, "inv-1", baseInvoice, patient, "Valor sessão: {{valor_sessao}}", "Dra. Ana")

    const updateCall = tx.invoice.update.mock.calls[0][0]
    expect(updateCall.data.messageBody).toContain("R$ 0,00")
  })

  it("queries invoiceItem.findMany with the correct invoiceId", async () => {
    const tx = makeMockTx([])
    await recalculateInvoice(tx, "inv-42", baseInvoice, basePatient, null, "Dra. Ana")

    expect(tx.invoiceItem.findMany).toHaveBeenCalledWith({
      where: { invoiceId: "inv-42" },
      include: {
        appointment: { select: { scheduledAt: true } },
      },
    })
  })
})
