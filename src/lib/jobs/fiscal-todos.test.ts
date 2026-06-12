import { describe, it, expect } from "vitest"
import {
  fiscalTodoKind,
  planPfTodos,
  planDmedTodos,
  filterNewTodos,
  reciboTodoTitle,
  dmedTodoTitle,
} from "./fiscal-todos"

describe("fiscalTodoKind", () => {
  it("is PF in January", () => {
    expect(fiscalTodoKind(new Date("2026-01-05T08:00:00Z"))).toBe("PF")
  })
  it("is PJ in February", () => {
    expect(fiscalTodoKind(new Date("2026-02-05T08:00:00Z"))).toBe("PJ")
  })
  it("is null in other months", () => {
    expect(fiscalTodoKind(new Date("2026-06-05T08:00:00Z"))).toBeNull()
  })
})

describe("planPfTodos", () => {
  const now = new Date("2026-01-05T08:00:00Z")

  it("creates one todo per PF professional with the previous year", () => {
    const todos = planPfTodos(
      [
        { professionalProfileId: "p1", clinicId: "c1" },
        { professionalProfileId: "p2", clinicId: "c1" },
      ],
      now
    )
    expect(todos).toHaveLength(2)
    expect(todos[0].title).toBe(reciboTodoTitle(2025))
    expect(todos[0].title).toBe("Emitir recibos Receita Saúde pendentes de 2025")
    expect(todos[0].notes).toContain("28/02/2026")
    expect(todos[0].day).toBe("2026-01-05")
  })
})

describe("planDmedTodos", () => {
  const now = new Date("2026-02-05T08:00:00Z")

  it("creates a todo for dmed-enabled clinics with an assignee", () => {
    const todos = planDmedTodos([{ clinicId: "c1", assigneeProfileId: "admin1" }], now)
    expect(todos).toHaveLength(1)
    expect(todos[0].title).toBe(dmedTodoTitle(2025))
    expect(todos[0].professionalProfileId).toBe("admin1")
    expect(todos[0].notes).toContain("último dia útil de fevereiro")
  })

  it("skips clinics with no assignee (no ADMIN with a profile, no fallback)", () => {
    const todos = planDmedTodos([{ clinicId: "c1", assigneeProfileId: null }], now)
    expect(todos).toHaveLength(0)
  })
})

describe("filterNewTodos (idempotency)", () => {
  const now = new Date("2026-01-05T08:00:00Z")

  it("drops todos that already exist", () => {
    const planned = planPfTodos([{ professionalProfileId: "p1", clinicId: "c1" }], now)
    const filtered = filterNewTodos(planned, [
      { clinicId: "c1", professionalProfileId: "p1", title: reciboTodoTitle(2025) },
    ])
    expect(filtered).toHaveLength(0)
  })

  it("keeps todos that do not yet exist", () => {
    const planned = planPfTodos([{ professionalProfileId: "p1", clinicId: "c1" }], now)
    expect(filterNewTodos(planned, [])).toHaveLength(1)
  })
})
