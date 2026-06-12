import { describe, it, expect } from "vitest"
import { collectPaymentEvents, type InvoiceWithPayments } from "./payment-events"

function baseInvoice(overrides: Partial<InvoiceWithPayments> = {}): InvoiceWithPayments {
  return {
    invoiceId: "inv1",
    patientId: "pat1",
    professionalProfileId: "prof1",
    status: "PAGO",
    totalAmount: 200,
    paidAt: new Date("2025-03-10"),
    links: [],
    ...overrides,
  }
}

describe("collectPaymentEvents", () => {
  it("creates one event per reconciliation link (date = transaction, amount = link)", () => {
    const events = collectPaymentEvents([
      baseInvoice({
        status: "PARCIAL",
        totalAmount: 200,
        paidAt: null,
        links: [
          {
            reconciliationLinkId: "l1",
            amount: 200,
            transactionDate: new Date("2025-02-05"),
            refundedAmount: 0,
          },
        ],
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].paymentKey).toBe("recl:l1")
    expect(events[0].amount).toBe(200)
    expect(events[0].paymentDate).toEqual(new Date("2025-02-05"))
    expect(events[0].reconciliationLinkId).toBe("l1")
  })

  it("two links → two events", () => {
    const events = collectPaymentEvents([
      baseInvoice({
        status: "PARCIAL",
        totalAmount: 300,
        paidAt: null,
        links: [
          { reconciliationLinkId: "l1", amount: 100, transactionDate: new Date("2025-02-05"), refundedAmount: 0 },
          { reconciliationLinkId: "l2", amount: 200, transactionDate: new Date("2025-02-20"), refundedAmount: 0 },
        ],
      }),
    ])
    expect(events.map((e) => e.paymentKey)).toEqual(["recl:l1", "recl:l2"])
  })

  it("PAGO with no links → one inv: event at paidAt for the full total", () => {
    const events = collectPaymentEvents([baseInvoice({ totalAmount: 200, paidAt: new Date("2025-03-10") })])
    expect(events).toHaveLength(1)
    expect(events[0].paymentKey).toBe("inv:inv1")
    expect(events[0].amount).toBe(200)
    expect(events[0].paymentDate).toEqual(new Date("2025-03-10"))
  })

  it("PAGO with links + residual > 0.01 → residual inv: event", () => {
    const events = collectPaymentEvents([
      baseInvoice({
        totalAmount: 200,
        paidAt: new Date("2025-03-10"),
        links: [
          { reconciliationLinkId: "l1", amount: 150, transactionDate: new Date("2025-02-05"), refundedAmount: 0 },
        ],
      }),
    ])
    expect(events).toHaveLength(2)
    const inv = events.find((e) => e.paymentKey === "inv:inv1")!
    expect(inv.amount).toBe(50)
  })

  it("PAGO with links + residual ≤ 0.01 → no extra inv: event", () => {
    const events = collectPaymentEvents([
      baseInvoice({
        totalAmount: 200,
        paidAt: new Date("2025-03-10"),
        links: [
          { reconciliationLinkId: "l1", amount: 199.995, transactionDate: new Date("2025-02-05"), refundedAmount: 0 },
        ],
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].paymentKey).toBe("recl:l1")
  })

  it("PARCIAL without links → no events", () => {
    const events = collectPaymentEvents([
      baseInvoice({ status: "PARCIAL", paidAt: null, links: [] }),
    ])
    expect(events).toHaveLength(0)
  })

  it("CANCELADO → no events", () => {
    const events = collectPaymentEvents([baseInvoice({ status: "CANCELADO" })])
    expect(events).toHaveLength(0)
  })

  it("PAGO without paidAt → inv: event with paymentDate null", () => {
    const events = collectPaymentEvents([baseInvoice({ paidAt: null })])
    expect(events).toHaveLength(1)
    expect(events[0].paymentDate).toBeNull()
  })

  it("propagates refundedAmount from the link's refund links", () => {
    const events = collectPaymentEvents([
      baseInvoice({
        status: "PARCIAL",
        paidAt: null,
        links: [
          { reconciliationLinkId: "l1", amount: 200, transactionDate: new Date("2025-02-05"), refundedAmount: 50 },
        ],
      }),
    ])
    expect(events[0].refundedAmount).toBe(50)
  })
})
