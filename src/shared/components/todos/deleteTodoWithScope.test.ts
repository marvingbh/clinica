import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { deleteTodoWithScope } from "./deleteTodoWithScope"

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

function ok(): Response {
  return { ok: true, json: async () => ({}) } as unknown as Response
}
function fail(): Response {
  return { ok: false, json: async () => ({ error: "boom" }) } as unknown as Response
}

describe("deleteTodoWithScope", () => {
  it("hits /api/todos/:id when no scope is provided", async () => {
    fetchMock.mockResolvedValueOnce(ok())

    const result = await deleteTodoWithScope("todo-1")

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith("/api/todos/todo-1", { method: "DELETE" })
  })

  it("hits /api/todos/:id on scope=this_only even when recurrenceId is given", async () => {
    fetchMock.mockResolvedValueOnce(ok())

    await deleteTodoWithScope("todo-1", { scope: "this_only", recurrenceId: "rec-1" })

    expect(fetchMock).toHaveBeenCalledWith("/api/todos/todo-1", { method: "DELETE" })
  })

  it("hits the recurrence endpoint on scope=all_future with a recurrenceId", async () => {
    fetchMock.mockResolvedValueOnce(ok())

    await deleteTodoWithScope("todo-1", { scope: "all_future", recurrenceId: "rec-1" })

    expect(fetchMock).toHaveBeenCalledWith("/api/todos/recurrences/rec-1", { method: "DELETE" })
  })

  it("falls back to single delete on scope=all_future without recurrenceId", async () => {
    fetchMock.mockResolvedValueOnce(ok())

    await deleteTodoWithScope("todo-1", { scope: "all_future", recurrenceId: null })

    expect(fetchMock).toHaveBeenCalledWith("/api/todos/todo-1", { method: "DELETE" })
  })

  it("returns false on failure", async () => {
    fetchMock.mockResolvedValueOnce(fail())

    const result = await deleteTodoWithScope("todo-1")

    expect(result).toBe(false)
  })
})
