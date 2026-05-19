import { describe, it, expect, vi } from "vitest"
import {
  findAppointmentsLinkedToInvoices,
  buildInvoiceLinkError,
  InvoiceLinkBlockedError,
  type InvoiceLinkBlock,
} from "./invoice-link-guard"

// Minimal `db` shape — just enough to satisfy the helper. Returning typed
// rows so the projection (.appointmentId, .invoice.status, etc.) matches the
// production select clause.
function makeDb(
  rows: Array<{
    appointmentId: string
    invoiceId: string
    invoice: { status: string; patient: { name: string } | null }
    appointment: { scheduledAt: Date } | null
  }>,
) {
  const findMany = vi.fn().mockResolvedValue(rows)
  return {
    db: { invoiceItem: { findMany } } as unknown as Parameters<typeof findAppointmentsLinkedToInvoices>[0],
    findMany,
  }
}

describe("findAppointmentsLinkedToInvoices", () => {
  it("short-circuits to [] when the id list is empty (no DB call)", async () => {
    const { db, findMany } = makeDb([])
    const result = await findAppointmentsLinkedToInvoices(db, [])
    expect(result).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it("returns blocks for items on non-cancelled invoices", async () => {
    const { db } = makeDb([
      {
        appointmentId: "apt-1",
        invoiceId: "inv-1",
        invoice: { status: "PAGO", patient: { name: "Alice" } },
        appointment: { scheduledAt: new Date("2026-05-19T17:00:00") },
      },
    ])
    const result = await findAppointmentsLinkedToInvoices(db, ["apt-1"])
    expect(result).toEqual([
      {
        appointmentId: "apt-1",
        scheduledAt: new Date("2026-05-19T17:00:00"),
        invoiceId: "inv-1",
        invoiceStatus: "PAGO",
        patientName: "Alice",
      },
    ])
  })

  it("filters out items on CANCELED invoices at the query layer", async () => {
    const { db, findMany } = makeDb([])
    await findAppointmentsLinkedToInvoices(db, ["apt-1"])
    expect(findMany).toHaveBeenCalledWith({
      where: {
        appointmentId: { in: ["apt-1"] },
        invoice: { status: { not: "CANCELADO" } },
      },
      select: expect.any(Object),
    })
  })

  it("returns multiple blocks (one per linked item) when several appointments are invoiced", async () => {
    const { db } = makeDb([
      {
        appointmentId: "apt-1",
        invoiceId: "inv-1",
        invoice: { status: "PENDENTE", patient: { name: "Alice" } },
        appointment: { scheduledAt: new Date("2026-05-19T17:00:00") },
      },
      {
        appointmentId: "apt-2",
        invoiceId: "inv-1",
        invoice: { status: "PENDENTE", patient: { name: "Alice" } },
        appointment: { scheduledAt: new Date("2026-05-26T17:00:00") },
      },
    ])
    const result = await findAppointmentsLinkedToInvoices(db, ["apt-1", "apt-2", "apt-3"])
    expect(result).toHaveLength(2)
    expect(result.map((b) => b.appointmentId).sort()).toEqual(["apt-1", "apt-2"])
  })

  it("returns null patientName when the invoice has no patient relation", async () => {
    const { db } = makeDb([
      {
        appointmentId: "apt-1",
        invoiceId: "inv-1",
        invoice: { status: "PAGO", patient: null },
        appointment: { scheduledAt: new Date("2026-05-19T17:00:00") },
      },
    ])
    const [block] = await findAppointmentsLinkedToInvoices(db, ["apt-1"])
    expect(block.patientName).toBeNull()
  })

  it("falls back to epoch when appointment has been detached (defensive)", async () => {
    const { db } = makeDb([
      {
        appointmentId: "apt-1",
        invoiceId: "inv-1",
        invoice: { status: "PAGO", patient: { name: "Alice" } },
        appointment: null,
      },
    ])
    const [block] = await findAppointmentsLinkedToInvoices(db, ["apt-1"])
    expect(block.scheduledAt).toEqual(new Date(0))
  })
})

describe("buildInvoiceLinkError", () => {
  function makeBlock(overrides: Partial<InvoiceLinkBlock> = {}): InvoiceLinkBlock {
    return {
      appointmentId: "apt-1",
      scheduledAt: new Date("2026-05-19T17:00:00"),
      invoiceId: "inv-1",
      invoiceStatus: "PAGO",
      patientName: "Alice",
      ...overrides,
    }
  }

  it("uses the stable error code regardless of block count", () => {
    expect(buildInvoiceLinkError([makeBlock()]).code).toBe("APPOINTMENT_LINKED_TO_INVOICE")
    expect(
      buildInvoiceLinkError([makeBlock({ appointmentId: "a" }), makeBlock({ appointmentId: "b" })]).code,
    ).toBe("APPOINTMENT_LINKED_TO_INVOICE")
  })

  it("singular message references the single invoice id when only one appointment is blocked", () => {
    const out = buildInvoiceLinkError([makeBlock({ invoiceId: "inv-X" })])
    expect(out.error).toContain("uma fatura (inv-X)")
  })

  it("plural message counts unique appointments AND unique invoices", () => {
    const out = buildInvoiceLinkError([
      makeBlock({ appointmentId: "a", invoiceId: "inv-1" }),
      makeBlock({ appointmentId: "b", invoiceId: "inv-1" }),
      makeBlock({ appointmentId: "c", invoiceId: "inv-2" }),
    ])
    expect(out.error).toContain("3 agendamento(s)")
    expect(out.error).toContain("2 fatura(s)")
  })

  it("passes the blocks array through unchanged", () => {
    const blocks = [makeBlock(), makeBlock({ appointmentId: "apt-2" })]
    expect(buildInvoiceLinkError(blocks).blocks).toBe(blocks)
  })
})

describe("InvoiceLinkBlockedError", () => {
  it("carries the blocks payload for routes to catch and surface", () => {
    const blocks: InvoiceLinkBlock[] = [
      {
        appointmentId: "apt-1",
        scheduledAt: new Date("2026-05-19T17:00:00"),
        invoiceId: "inv-1",
        invoiceStatus: "PAGO",
        patientName: "Alice",
      },
    ]
    const err = new InvoiceLinkBlockedError(blocks)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("InvoiceLinkBlockedError")
    expect(err.blocks).toBe(blocks)
  })
})
