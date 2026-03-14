import { describe, it, expect } from "vitest"
import { isDraggable, computeNewTimeRange } from "./drag-constraints"

describe("isDraggable", () => {
  const base = { status: "AGENDADO" as const, groupId: null }

  it("returns true for AGENDADO with write permission", () => {
    expect(isDraggable(base, true)).toBe(true)
  })

  it("returns true for CONFIRMADO with write permission", () => {
    expect(isDraggable({ ...base, status: "CONFIRMADO" }, true)).toBe(true)
  })

  it("returns false for FINALIZADO", () => {
    expect(isDraggable({ ...base, status: "FINALIZADO" }, true)).toBe(false)
  })

  it("returns false for CANCELADO_ACORDADO", () => {
    expect(isDraggable({ ...base, status: "CANCELADO_ACORDADO" }, true)).toBe(false)
  })

  it("returns false for CANCELADO_FALTA", () => {
    expect(isDraggable({ ...base, status: "CANCELADO_FALTA" }, true)).toBe(false)
  })

  it("returns false for CANCELADO_PROFISSIONAL", () => {
    expect(isDraggable({ ...base, status: "CANCELADO_PROFISSIONAL" }, true)).toBe(false)
  })

  it("returns false when groupId is set", () => {
    expect(isDraggable({ ...base, groupId: "group-1" }, true)).toBe(false)
  })

  it("returns false when canWriteAgenda is false", () => {
    expect(isDraggable(base, false)).toBe(false)
  })
})

describe("computeNewTimeRange", () => {
  const original = {
    scheduledAt: "2026-03-14T14:00:00.000Z",
    endAt: "2026-03-14T14:50:00.000Z",
  }

  it("preserves duration when moving to a new time", () => {
    const result = computeNewTimeRange(original, { hours: 16, minutes: 30 })
    const start = new Date(result.scheduledAt)
    const end = new Date(result.endAt)
    const durationMs = end.getTime() - start.getTime()
    expect(durationMs).toBe(50 * 60 * 1000) // 50 minutes
    expect(start.getHours()).toBe(16)
    expect(start.getMinutes()).toBe(30)
  })

  it("changes the date when target.date is provided", () => {
    const result = computeNewTimeRange(original, {
      hours: 10,
      minutes: 0,
      date: "2026-03-17",
    })
    const start = new Date(result.scheduledAt)
    expect(start.getDate()).toBe(17)
    expect(start.getMonth()).toBe(2) // March = 2
    expect(start.getHours()).toBe(10)
    expect(start.getMinutes()).toBe(0)
  })

  it("handles midnight boundary (23:30 + 50min)", () => {
    const result = computeNewTimeRange(original, { hours: 23, minutes: 30 })
    const start = new Date(result.scheduledAt)
    const end = new Date(result.endAt)
    expect(start.getHours()).toBe(23)
    expect(start.getMinutes()).toBe(30)
    // End goes to next day 00:20
    expect(end.getDate()).toBe(start.getDate() + 1)
    expect(end.getHours()).toBe(0)
    expect(end.getMinutes()).toBe(20)
  })
})
