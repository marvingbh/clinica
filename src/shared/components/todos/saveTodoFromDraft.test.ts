import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { saveTodoFromDraft } from "./saveTodoFromDraft"
import type { TodoFormData } from "@/app/tarefas/types"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ok(body: unknown = {}): Response {
  return { ok: true, json: async () => body } as unknown as Response
}
function fail(status = 400, body: unknown = { error: "boom" }): Response {
  return { ok: false, status, json: async () => body } as unknown as Response
}

const baseDraft: TodoFormData = {
  id: "todo-1",
  title: "Reescrever",
  notes: "novo",
  day: "2026-05-10",
  professionalProfileId: "prof-1",
  done: false,
  recurrenceType: "",
  recurrenceEndType: "INDEFINITE",
  occurrences: 8,
  endDate: "",
}

describe("saveTodoFromDraft", () => {
  it("creates a new todo via POST /api/todos when draft has no id", async () => {
    fetchMock.mockResolvedValueOnce(ok())
    const draft: TodoFormData = { ...baseDraft, id: undefined }

    const result = await saveTodoFromDraft(draft)

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/todos")
    expect(init.method).toBe("POST")
    const body = JSON.parse(init.body)
    expect(body.title).toBe("Reescrever")
    expect(body.recurrence).toBeUndefined() // recurrenceType is "" → no recurrence
  })

  it("includes recurrence payload when creating with recurrenceType", async () => {
    fetchMock.mockResolvedValueOnce(ok())
    const draft: TodoFormData = {
      ...baseDraft,
      id: undefined,
      recurrenceType: "WEEKLY",
      recurrenceEndType: "BY_OCCURRENCES",
      occurrences: 4,
    }

    await saveTodoFromDraft(draft)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.recurrence).toEqual({
      recurrenceType: "WEEKLY",
      recurrenceEndType: "BY_OCCURRENCES",
      occurrences: 4,
    })
  })

  it("patches the single todo when scope is omitted", async () => {
    fetchMock.mockResolvedValueOnce(ok())

    await saveTodoFromDraft(baseDraft)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/todos/todo-1")
    expect(init.method).toBe("PATCH")
  })

  it("patches the single todo when scope=this_only (treated as default)", async () => {
    fetchMock.mockResolvedValueOnce(ok())

    await saveTodoFromDraft(baseDraft, { scope: "this_only", recurrenceId: "rec-1" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/todos/todo-1")
  })

  it("falls back to single-todo PATCH when scope=all_future but no recurrenceId is provided", async () => {
    // Defensive: caller signaled all_future but the todo isn't actually part
    // of a recurrence — don't try to hit the recurrence endpoint with null.
    fetchMock.mockResolvedValueOnce(ok())

    await saveTodoFromDraft(baseDraft, { scope: "all_future", recurrenceId: null })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/todos/todo-1")
  })

  it("scope=all_future + recurrenceId hits recurrence first then per-occurrence patch", async () => {
    fetchMock.mockResolvedValueOnce(ok()) // recurrence PATCH
    fetchMock.mockResolvedValueOnce(ok()) // single PATCH

    const result = await saveTodoFromDraft(
      { ...baseDraft, notes: "novo" },
      { scope: "all_future", recurrenceId: "rec-1" },
    )

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [url1, init1] = fetchMock.mock.calls[0]
    expect(url1).toBe("/api/todos/recurrences/rec-1")
    expect(init1.method).toBe("PATCH")
    const recBody = JSON.parse(init1.body)
    expect(recBody).toEqual({ title: "Reescrever", notes: "novo" })

    const [url2, init2] = fetchMock.mock.calls[1]
    expect(url2).toBe("/api/todos/todo-1")
    expect(init2.method).toBe("PATCH")
    const occBody = JSON.parse(init2.body)
    expect(occBody).toEqual({
      day: "2026-05-10",
      professionalProfileId: "prof-1",
      done: false,
    })
  })

  it("sends notes as null when blank in all_future scope", async () => {
    fetchMock.mockResolvedValueOnce(ok())
    fetchMock.mockResolvedValueOnce(ok())

    await saveTodoFromDraft(
      { ...baseDraft, notes: "" },
      { scope: "all_future", recurrenceId: "rec-1" },
    )

    const recBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(recBody.notes).toBeNull()
  })

  it("returns false and stops if recurrence PATCH fails", async () => {
    fetchMock.mockResolvedValueOnce(fail(500))

    const result = await saveTodoFromDraft(baseDraft, {
      scope: "all_future",
      recurrenceId: "rec-1",
    })

    expect(result).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1) // didn't proceed to per-occurrence
  })

  it("returns false if per-occurrence PATCH fails after series success", async () => {
    fetchMock.mockResolvedValueOnce(ok())
    fetchMock.mockResolvedValueOnce(fail(500))

    const result = await saveTodoFromDraft(baseDraft, {
      scope: "all_future",
      recurrenceId: "rec-1",
    })

    expect(result).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("returns false on single-todo PATCH failure", async () => {
    fetchMock.mockResolvedValueOnce(fail())

    const result = await saveTodoFromDraft(baseDraft)

    expect(result).toBe(false)
  })
})
