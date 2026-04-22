import { describe, it, expect } from "vitest"
import { buildInvoiceSlotMap, compareSlots } from "./invoice-slot"

describe("buildInvoiceSlotMap", () => {
  it("picks the recurrence's dayOfWeek/startTime when a recurring appointment is linked", () => {
    const map = buildInvoiceSlotMap([
      {
        invoiceId: "inv-1",
        appointment: {
          scheduledAt: new Date("2026-03-02T14:00:00Z"),
          recurrence: { dayOfWeek: 1, startTime: "11:00" },
        },
      },
    ])
    expect(map.get("inv-1")).toEqual({ dayOfWeek: 1, time: "11:00" })
  })

  it("prefers a recurrence-linked item over a non-recurring one on the same invoice", () => {
    const map = buildInvoiceSlotMap([
      {
        invoiceId: "inv-1",
        appointment: {
          scheduledAt: new Date("2026-03-02T14:00:00Z"),
          recurrence: null,
        },
      },
      {
        invoiceId: "inv-1",
        appointment: {
          scheduledAt: new Date("2026-03-03T14:00:00Z"),
          recurrence: { dayOfWeek: 2, startTime: "09:00" },
        },
      },
    ])
    expect(map.get("inv-1")).toEqual({ dayOfWeek: 2, time: "09:00" })
  })

  it("falls back to the earliest scheduledAt when no recurrence exists", () => {
    const map = buildInvoiceSlotMap([
      {
        invoiceId: "inv-1",
        appointment: {
          // 2026-03-04 (Wed) 18:00 UTC = 15:00 BRT
          scheduledAt: new Date("2026-03-04T18:00:00Z"),
          recurrence: null,
        },
      },
      {
        invoiceId: "inv-1",
        appointment: {
          scheduledAt: new Date("2026-03-11T18:00:00Z"),
          recurrence: null,
        },
      },
    ])
    const slot = map.get("inv-1")!
    expect(slot.dayOfWeek).toBe(3) // Wednesday in São Paulo time
    expect(slot.time).toBe("15:00")
  })

  it("ignores items without an appointment (manual / CREDITO)", () => {
    const map = buildInvoiceSlotMap([
      { invoiceId: "inv-1", appointment: null },
      { invoiceId: "inv-1", appointment: null },
    ])
    expect(map.has("inv-1")).toBe(false)
  })

  it("handles a mix of invoices independently", () => {
    const map = buildInvoiceSlotMap([
      {
        invoiceId: "inv-1",
        appointment: {
          scheduledAt: new Date("2026-03-02T14:00:00Z"),
          recurrence: { dayOfWeek: 1, startTime: "11:00" },
        },
      },
      {
        invoiceId: "inv-2",
        appointment: {
          scheduledAt: new Date("2026-03-05T13:00:00Z"),
          recurrence: { dayOfWeek: 4, startTime: "10:00" },
        },
      },
    ])
    expect(map.get("inv-1")).toEqual({ dayOfWeek: 1, time: "11:00" })
    expect(map.get("inv-2")).toEqual({ dayOfWeek: 4, time: "10:00" })
  })
})

describe("compareSlots", () => {
  it("orders by dayOfWeek first, then by time", () => {
    const sorted = [
      { dayOfWeek: 2, time: "09:00" },
      { dayOfWeek: 1, time: "14:00" },
      { dayOfWeek: 1, time: "09:00" },
      { dayOfWeek: 3, time: "08:00" },
    ].sort(compareSlots)
    expect(sorted).toEqual([
      { dayOfWeek: 1, time: "09:00" },
      { dayOfWeek: 1, time: "14:00" },
      { dayOfWeek: 2, time: "09:00" },
      { dayOfWeek: 3, time: "08:00" },
    ])
  })

  it("sorts nulls to the end", () => {
    const arr: Array<{ dayOfWeek: number; time: string } | null> = [
      null,
      { dayOfWeek: 5, time: "10:00" },
      null,
      { dayOfWeek: 1, time: "09:00" },
    ]
    arr.sort(compareSlots)
    expect(arr[0]).toEqual({ dayOfWeek: 1, time: "09:00" })
    expect(arr[1]).toEqual({ dayOfWeek: 5, time: "10:00" })
    expect(arr[2]).toBeNull()
    expect(arr[3]).toBeNull()
  })
})
