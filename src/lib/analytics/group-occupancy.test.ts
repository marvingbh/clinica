import { describe, it, expect } from "vitest"
import { groupOccupancy, type GroupSessionSlim } from "./group-occupancy"

function row(groupId: string, sessionTime: string, status: string): GroupSessionSlim {
  return {
    groupKey: `${groupId}|${sessionTime}`,
    groupId,
    scheduledAt: new Date(sessionTime),
    status,
  }
}

describe("groupOccupancy", () => {
  it("computes average present and occupancy with explicit capacity", () => {
    const members: GroupSessionSlim[] = [
      // Session 1: 3 present
      row("g1", "2026-05-04T17:00:00Z", "FINALIZADO"),
      row("g1", "2026-05-04T17:00:00Z", "FINALIZADO"),
      row("g1", "2026-05-04T17:00:00Z", "CONFIRMADO"),
      // Session 2: 1 present
      row("g1", "2026-05-11T17:00:00Z", "FINALIZADO"),
    ]
    const rows = groupOccupancy({
      memberAppointments: members,
      capacityByGroup: new Map([["g1", 4]]),
      activeMembersByGroup: new Map([["g1", 10]]),
    })
    const r = rows.find((x) => x.groupId === "g1")!
    expect(r.sessions).toBe(2)
    expect(r.avgPresent).toBe(2) // (3 + 1) / 2
    expect(r.capacity).toBe(4)
    expect(r.occupancyPct).toBe(0.5) // 2 / 4
  })

  it("falls back to active members when capacity is null", () => {
    const members: GroupSessionSlim[] = [row("g1", "2026-05-04T17:00:00Z", "FINALIZADO")]
    const rows = groupOccupancy({
      memberAppointments: members,
      capacityByGroup: new Map([["g1", null]]),
      activeMembersByGroup: new Map([["g1", 5]]),
    })
    expect(rows[0].capacity).toBe(5)
    expect(rows[0].occupancyPct).toBe(0.2) // 1 / 5
  })

  it("counts faltas separately and excludes them from present", () => {
    const members: GroupSessionSlim[] = [
      row("g1", "2026-05-04T17:00:00Z", "FINALIZADO"),
      row("g1", "2026-05-04T17:00:00Z", "CANCELADO_FALTA"),
    ]
    const rows = groupOccupancy({
      memberAppointments: members,
      capacityByGroup: new Map([["g1", 4]]),
      activeMembersByGroup: new Map(),
    })
    expect(rows[0].faltas).toBe(1)
    expect(rows[0].avgPresent).toBe(1)
  })

  it("excludes professional-cancelled sessions from the denominator", () => {
    const members: GroupSessionSlim[] = [
      // Session fully cancelled by the professional → not counted
      row("g1", "2026-05-04T17:00:00Z", "CANCELADO_PROFISSIONAL"),
      row("g1", "2026-05-04T17:00:00Z", "CANCELADO_PROFISSIONAL"),
      // A real session
      row("g1", "2026-05-11T17:00:00Z", "FINALIZADO"),
    ]
    const rows = groupOccupancy({
      memberAppointments: members,
      capacityByGroup: new Map([["g1", 4]]),
      activeMembersByGroup: new Map(),
    })
    expect(rows[0].sessions).toBe(1)
    expect(rows[0].avgPresent).toBe(1)
  })

  it("returns null occupancy when capacity is unknown (0)", () => {
    const members: GroupSessionSlim[] = [row("g1", "2026-05-04T17:00:00Z", "FINALIZADO")]
    const rows = groupOccupancy({
      memberAppointments: members,
      capacityByGroup: new Map(),
      activeMembersByGroup: new Map(),
    })
    expect(rows[0].capacity).toBe(0)
    expect(rows[0].occupancyPct).toBeNull()
  })
})
