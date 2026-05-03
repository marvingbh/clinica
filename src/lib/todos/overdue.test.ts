import { describe, it, expect } from "vitest"
import { isOverdue } from "./overdue"

describe("todos/overdue", () => {
  const now = new Date(2026, 4, 3, 10, 0)

  it("is false for done todos regardless of date", () => {
    expect(isOverdue({ done: true, day: "2020-01-01" }, now)).toBe(false)
  })

  it("is false when the day is today", () => {
    expect(isOverdue({ done: false, day: "2026-05-03" }, now)).toBe(false)
  })

  it("is false for future days", () => {
    expect(isOverdue({ done: false, day: "2026-05-04" }, now)).toBe(false)
  })

  it("is true for past open days", () => {
    expect(isOverdue({ done: false, day: "2026-05-02" }, now)).toBe(true)
    expect(isOverdue({ done: false, day: "2025-12-31" }, now)).toBe(true)
  })
})
