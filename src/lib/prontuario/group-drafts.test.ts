import { describe, it, expect } from "vitest"
import { buildGroupDraftInputs, type GroupMemberAppointment } from "./group-drafts"

const base = {
  clinicId: "c1",
  professionalProfileId: "prof1",
  format: "SOAP" as const,
  templateId: "tpl1" as string | null,
}

const members: GroupMemberAppointment[] = [
  { appointmentId: "a1", patientId: "p1", scheduledAt: new Date("2026-06-09T15:00:00Z") },
  { appointmentId: "a2", patientId: "p2", scheduledAt: new Date("2026-06-09T15:00:00Z") },
]

describe("buildGroupDraftInputs", () => {
  it("builds one draft per member", () => {
    const { drafts, skipped } = buildGroupDraftInputs(members, new Set(), base)
    expect(drafts).toHaveLength(2)
    expect(skipped).toEqual([])
    expect(drafts[0].sessionDate).toEqual(new Date("2026-06-09T15:00:00Z"))
    expect(drafts[0].patientId).toBe("p1")
    expect(drafts[0].appointmentId).toBe("a1")
  })

  it("skips members that already have a note", () => {
    const { drafts, skipped } = buildGroupDraftInputs(members, new Set(["a1"]), base)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].appointmentId).toBe("a2")
    expect(skipped).toEqual(["a1"])
  })

  it("returns empty results for an empty member list", () => {
    expect(buildGroupDraftInputs([], new Set(), base)).toEqual({ drafts: [], skipped: [] })
  })
})
