import { describe, it, expect } from "vitest"
import { resolveRoomKey, deriveRoomName } from "./room-names"

const SECRET = "test-secret"
const SCHEDULED = new Date("2026-06-11T14:00:00.000Z")

describe("resolveRoomKey", () => {
  it("keys recurring group sessions by groupId + scheduledAt", () => {
    const key = resolveRoomKey({
      id: "appt-1",
      groupId: "grp-1",
      sessionGroupId: null,
      scheduledAt: SCHEDULED,
    })
    expect(key).toBe(`group:grp-1:${SCHEDULED.toISOString()}`)
  })

  it("keys one-off group sessions by sessionGroupId", () => {
    const key = resolveRoomKey({
      id: "appt-1",
      groupId: null,
      sessionGroupId: "sess-1",
      scheduledAt: SCHEDULED,
    })
    expect(key).toBe("session:sess-1")
  })

  it("keys individual consultations by appointmentId", () => {
    const key = resolveRoomKey({
      id: "appt-1",
      groupId: null,
      sessionGroupId: null,
      scheduledAt: SCHEDULED,
    })
    expect(key).toBe("appt:appt-1")
  })

  it("prefers groupId over sessionGroupId when both present", () => {
    const key = resolveRoomKey({
      id: "appt-1",
      groupId: "grp-1",
      sessionGroupId: "sess-1",
      scheduledAt: SCHEDULED,
    })
    expect(key).toBe(`group:grp-1:${SCHEDULED.toISOString()}`)
  })

  it("recurring group members at the same slot share a key", () => {
    const base = { groupId: "grp-1", sessionGroupId: null, scheduledAt: SCHEDULED }
    expect(resolveRoomKey({ ...base, id: "a" })).toBe(resolveRoomKey({ ...base, id: "b" }))
  })
})

describe("deriveRoomName", () => {
  it("is deterministic for the same key + secret", () => {
    expect(deriveRoomName("appt:1", SECRET)).toBe(deriveRoomName("appt:1", SECRET))
  })

  it("produces distinct names for distinct keys", () => {
    expect(deriveRoomName("appt:1", SECRET)).not.toBe(deriveRoomName("appt:2", SECRET))
  })

  it("changes when the secret changes", () => {
    expect(deriveRoomName("appt:1", SECRET)).not.toBe(deriveRoomName("appt:1", "other"))
  })

  it("matches the format clinica-[0-9a-f]{20} and carries no PII", () => {
    const name = deriveRoomName("appt:joao-silva", SECRET)
    expect(name).toMatch(/^clinica-[0-9a-f]{20}$/)
    expect(name).not.toContain("joao")
    expect(name).not.toContain("silva")
  })
})
