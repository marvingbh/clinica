import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { emptyTodoDraft, todoToFormDraft } from "./todoFormDraft"
import type { TodoListItem } from "@/app/tarefas/types"

beforeAll(() => {
  // Pin "today" so emptyTodoDraft.day is deterministic in CI.
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-05-10T12:00:00Z"))
})

afterAll(() => {
  vi.useRealTimers()
})

const baseTodo: TodoListItem = {
  id: "todo-1",
  clinicId: "clinic-1",
  professionalProfileId: "prof-1",
  recurrenceId: null,
  title: "Pendência",
  notes: "detalhe",
  day: "2026-05-15T00:00:00.000Z",
  done: false,
  doneAt: null,
  order: 0,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  recurrence: null,
  professionalProfile: { id: "prof-1", user: { name: "Elena" } },
}

describe("emptyTodoDraft", () => {
  it("uses today as the day and seeds default recurrence flags", () => {
    const draft = emptyTodoDraft("prof-1")
    expect(draft.day).toBe("2026-05-10")
    expect(draft.professionalProfileId).toBe("prof-1")
    expect(draft.title).toBe("")
    expect(draft.notes).toBe("")
    expect(draft.done).toBe(false)
    expect(draft.recurrenceType).toBe("")
    expect(draft.recurrenceEndType).toBe("INDEFINITE")
    expect(draft.occurrences).toBe(8)
    expect(draft.endDate).toBe("")
  })
})

describe("todoToFormDraft", () => {
  it("strips the time portion from day", () => {
    const draft = todoToFormDraft(baseTodo)
    expect(draft.day).toBe("2026-05-15")
  })

  it("preserves the id so PATCH callers know it's an edit", () => {
    expect(todoToFormDraft(baseTodo).id).toBe("todo-1")
  })

  it("defaults notes to empty string when null", () => {
    const draft = todoToFormDraft({ ...baseTodo, notes: null })
    expect(draft.notes).toBe("")
  })

  it("hydrates recurrence fields from a recurring todo", () => {
    const draft = todoToFormDraft({
      ...baseTodo,
      recurrenceId: "rec-1",
      recurrence: {
        id: "rec-1",
        recurrenceType: "WEEKLY",
        recurrenceEndType: "BY_DATE",
        endDate: "2026-12-31T00:00:00.000Z",
        occurrences: null,
        isActive: true,
      },
    })
    expect(draft.recurrenceType).toBe("WEEKLY")
    expect(draft.recurrenceEndType).toBe("BY_DATE")
    expect(draft.endDate).toBe("2026-12-31")
    expect(draft.occurrences).toBe(8) // falls back to default when null
  })

  it("leaves recurrence fields at sensible defaults when no recurrence", () => {
    const draft = todoToFormDraft(baseTodo)
    expect(draft.recurrenceType).toBe("")
    expect(draft.recurrenceEndType).toBe("INDEFINITE")
    expect(draft.endDate).toBe("")
  })
})
