import { describe, it, expect } from "vitest"
import { needsTodoExtension, filterTodoExceptions, nextBatchForRecurrence } from "./extend"

describe("todos/extend/needsTodoExtension", () => {
  const now = new Date(2026, 4, 3) // 2026-05-03
  const startDate = new Date(2026, 0, 1)

  it("is true when never generated", () => {
    expect(needsTodoExtension(null, startDate, now)).toBe(true)
  })

  it("is true when lastGenerated < startDate", () => {
    expect(needsTodoExtension(new Date(2025, 11, 1), startDate, now)).toBe(true)
  })

  it("is true when last generated is within 30 days of now", () => {
    const last = new Date(2026, 4, 20) // 17 days ahead
    expect(needsTodoExtension(last, startDate, now)).toBe(true)
  })

  it("is false when last generated is far in the future", () => {
    const last = new Date(2026, 7, 1) // ~3 months ahead
    expect(needsTodoExtension(last, startDate, now)).toBe(false)
  })
})

describe("todos/extend/filterTodoExceptions", () => {
  it("removes excluded dates", () => {
    const out = filterTodoExceptions(
      ["2026-05-04", "2026-05-11", "2026-05-18"],
      ["2026-05-11"]
    )
    expect(out).toEqual(["2026-05-04", "2026-05-18"])
  })

  it("returns input unchanged when exceptions empty", () => {
    const dates = ["2026-05-04", "2026-05-11"]
    expect(filterTodoExceptions(dates, [])).toEqual(dates)
  })
})

describe("todos/extend/nextBatchForRecurrence", () => {
  it("WEEKLY produces 3 months of dates honoring exceptions", () => {
    const out = nextBatchForRecurrence(new Date(2026, 4, 4), "WEEKLY", 1, ["2026-05-18"])
    expect(out[0]).toBe("2026-05-11")
    expect(out).not.toContain("2026-05-18")
  })
})
