import { describe, it, expect } from "vitest"
import { sortCombined, maxOpenCountByDay } from "./sort"

describe("todos/sort", () => {
  it("places open todos before completed", () => {
    const result = sortCombined([
      { id: "a", done: true, order: 0, createdAt: "2026-05-01" },
      { id: "b", done: false, order: 0, createdAt: "2026-05-01" },
    ])
    expect(result.map((t) => t.id)).toEqual(["b", "a"])
  })

  it("orders open todos by order, then createdAt", () => {
    const result = sortCombined([
      { id: "a", done: false, order: 2, createdAt: "2026-05-01" },
      { id: "b", done: false, order: 0, createdAt: "2026-05-01" },
      { id: "c", done: false, order: 1, createdAt: "2026-05-01" },
    ])
    expect(result.map((t) => t.id)).toEqual(["b", "c", "a"])
  })

  it("orders completed todos by updatedAt desc", () => {
    const result = sortCombined([
      { id: "a", done: true, order: 0, createdAt: "2026-05-01", updatedAt: "2026-05-02" },
      { id: "b", done: true, order: 0, createdAt: "2026-05-01", updatedAt: "2026-05-04" },
      { id: "c", done: true, order: 0, createdAt: "2026-05-01", updatedAt: "2026-05-03" },
    ])
    expect(result.map((t) => t.id)).toEqual(["b", "c", "a"])
  })
})

describe("todos/sort/maxOpenCountByDay", () => {
  it("returns 0 when no open todos exist", () => {
    expect(maxOpenCountByDay([])).toBe(0)
    expect(maxOpenCountByDay([{ day: "2026-05-03", done: true }])).toBe(0)
  })

  it("counts only open todos and returns the max across days", () => {
    const todos = [
      { day: "2026-05-03", done: false },
      { day: "2026-05-03", done: false },
      { day: "2026-05-03", done: true }, // ignored
      { day: "2026-05-04", done: false },
    ]
    expect(maxOpenCountByDay(todos)).toBe(2)
  })
})
