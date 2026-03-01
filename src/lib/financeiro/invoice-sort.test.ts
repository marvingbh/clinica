import { describe, it, expect } from "vitest"
import {
  weekdayRank,
  pickEarliestRecurrence,
  sortInvoicesByRecurrence,
} from "./invoice-sort"

describe("weekdayRank", () => {
  it("maps Monday (1) to rank 0 (first)", () => {
    expect(weekdayRank(1)).toBe(0)
  })

  it("maps Friday (5) to rank 4", () => {
    expect(weekdayRank(5)).toBe(4)
  })

  it("maps Saturday (6) to rank 5", () => {
    expect(weekdayRank(6)).toBe(5)
  })

  it("maps Sunday (0) to rank 6 (last)", () => {
    expect(weekdayRank(0)).toBe(6)
  })
})

describe("pickEarliestRecurrence", () => {
  it("returns null for empty array", () => {
    expect(pickEarliestRecurrence([])).toBeNull()
  })

  it("returns the only recurrence", () => {
    const rec = { dayOfWeek: 3, startTime: "10:00" }
    expect(pickEarliestRecurrence([rec])).toEqual(rec)
  })

  it("picks the earlier day of week", () => {
    const mon = { dayOfWeek: 1, startTime: "14:00" }
    const wed = { dayOfWeek: 3, startTime: "08:00" }
    expect(pickEarliestRecurrence([wed, mon])).toEqual(mon)
  })

  it("picks earlier time on same day", () => {
    const early = { dayOfWeek: 2, startTime: "08:00" }
    const late = { dayOfWeek: 2, startTime: "16:00" }
    expect(pickEarliestRecurrence([late, early])).toEqual(early)
  })

  it("Sunday is later than Saturday", () => {
    const sat = { dayOfWeek: 6, startTime: "10:00" }
    const sun = { dayOfWeek: 0, startTime: "08:00" }
    expect(pickEarliestRecurrence([sun, sat])).toEqual(sat)
  })
})

describe("sortInvoicesByRecurrence", () => {
  const inv = (patientId: string, name: string) => ({
    patientId,
    patient: { name },
  })

  it("sorts by day of week ascending (Mon first)", () => {
    const invoices = [
      inv("p-fri", "Zara"),
      inv("p-mon", "Ana"),
    ]
    const recMap = new Map([
      ["p-fri", { dayOfWeek: 5, startTime: "09:00" }],
      ["p-mon", { dayOfWeek: 1, startTime: "09:00" }],
    ])
    const sorted = sortInvoicesByRecurrence(invoices, recMap)
    expect(sorted.map(i => i.patientId)).toEqual(["p-mon", "p-fri"])
  })

  it("sorts by time within same day", () => {
    const invoices = [
      inv("p-late", "Ana"),
      inv("p-early", "Zara"),
    ]
    const recMap = new Map([
      ["p-late", { dayOfWeek: 1, startTime: "18:00" }],
      ["p-early", { dayOfWeek: 1, startTime: "08:00" }],
    ])
    const sorted = sortInvoicesByRecurrence(invoices, recMap)
    expect(sorted.map(i => i.patientId)).toEqual(["p-early", "p-late"])
  })

  it("puts invoices without recurrence at the end", () => {
    const invoices = [
      inv("p-norec", "Ana"),
      inv("p-mon", "Zara"),
    ]
    const recMap = new Map([
      ["p-mon", { dayOfWeek: 1, startTime: "09:00" }],
    ])
    const sorted = sortInvoicesByRecurrence(invoices, recMap)
    expect(sorted.map(i => i.patientId)).toEqual(["p-mon", "p-norec"])
  })

  it("sorts no-recurrence invoices by name among themselves", () => {
    const invoices = [
      inv("p-z", "Zara"),
      inv("p-a", "Ana"),
    ]
    const recMap = new Map<string, { dayOfWeek: number; startTime: string }>()
    const sorted = sortInvoicesByRecurrence(invoices, recMap)
    expect(sorted.map(i => i.patient.name)).toEqual(["Ana", "Zara"])
  })

  it("sorts by name when day+time are identical", () => {
    const invoices = [
      inv("p-z", "Zara"),
      inv("p-a", "Ana"),
    ]
    const recMap = new Map([
      ["p-z", { dayOfWeek: 1, startTime: "08:00" }],
      ["p-a", { dayOfWeek: 1, startTime: "08:00" }],
    ])
    const sorted = sortInvoicesByRecurrence(invoices, recMap)
    expect(sorted.map(i => i.patient.name)).toEqual(["Ana", "Zara"])
  })

  it("does not mutate the original array", () => {
    const invoices = [inv("p-b", "B"), inv("p-a", "A")]
    const recMap = new Map([
      ["p-b", { dayOfWeek: 5, startTime: "09:00" }],
      ["p-a", { dayOfWeek: 1, startTime: "09:00" }],
    ])
    const sorted = sortInvoicesByRecurrence(invoices, recMap)
    expect(sorted).not.toBe(invoices)
    expect(invoices[0].patientId).toBe("p-b") // original unchanged
  })

  it("handles full week sort correctly", () => {
    const invoices = [
      inv("p-sun", "Sun"),
      inv("p-wed", "Wed"),
      inv("p-mon", "Mon"),
      inv("p-fri", "Fri"),
    ]
    const recMap = new Map([
      ["p-sun", { dayOfWeek: 0, startTime: "10:00" }],
      ["p-wed", { dayOfWeek: 3, startTime: "10:00" }],
      ["p-mon", { dayOfWeek: 1, startTime: "10:00" }],
      ["p-fri", { dayOfWeek: 5, startTime: "10:00" }],
    ])
    const sorted = sortInvoicesByRecurrence(invoices, recMap)
    expect(sorted.map(i => i.patientId)).toEqual([
      "p-mon", "p-wed", "p-fri", "p-sun",
    ])
  })
})
