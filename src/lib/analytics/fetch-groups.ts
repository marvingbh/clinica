import { prisma } from "@/lib/prisma"
import type { ReportScope } from "./fetch-shared"
import { groupOccupancy, type GroupSessionSlim, type GroupOccupancyRow } from "./group-occupancy"

export interface GroupRow extends GroupOccupancyRow {
  groupName: string
  professionalName: string
}

/**
 * Per-group occupancy in the period. Own-scope restricts to groups led by the
 * professional. Uses TherapyGroup.capacity when set, else active member count.
 */
export async function fetchGroups(scope: ReportScope): Promise<GroupRow[]> {
  const { clinicId, professionalProfileId, range } = scope

  const groups = await prisma.therapyGroup.findMany({
    where: {
      clinicId,
      isActive: true,
      ...(professionalProfileId ? { professionalProfileId } : {}),
    },
    select: {
      id: true,
      name: true,
      capacity: true,
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })
  if (groups.length === 0) return []

  const groupIds = groups.map((g) => g.id)

  // Per-member appointment rows for these groups in the range.
  const appts = await prisma.appointment.findMany({
    where: {
      clinicId,
      type: "CONSULTA",
      groupId: { in: groupIds },
      scheduledAt: { gte: range.start, lt: range.end },
    },
    select: { groupId: true, scheduledAt: true, status: true },
  })

  const memberAppointments: GroupSessionSlim[] = appts
    .filter((a) => a.groupId)
    .map((a) => ({
      groupKey: `${a.groupId}|${a.scheduledAt.getTime()}`,
      groupId: a.groupId!,
      scheduledAt: a.scheduledAt,
      status: a.status,
    }))

  // Active members per group (leaveDate null) — the capacity fallback.
  const memberships = await prisma.groupMembership.groupBy({
    by: ["groupId"],
    where: { clinicId, groupId: { in: groupIds }, leaveDate: null },
    _count: { _all: true },
  })
  const activeMembersByGroup = new Map<string, number>(
    memberships.map((m) => [m.groupId, m._count._all])
  )
  const capacityByGroup = new Map<string, number | null>(groups.map((g) => [g.id, g.capacity]))

  const rows = groupOccupancy({ memberAppointments, capacityByGroup, activeMembersByGroup })
  const rowById = new Map(rows.map((r) => [r.groupId, r]))

  // Include groups with no sessions in the period (occupancy 0, sessions 0).
  return groups.map((g) => {
    const r = rowById.get(g.id) ?? {
      groupId: g.id,
      sessions: 0,
      avgPresent: 0,
      capacity: g.capacity ?? activeMembersByGroup.get(g.id) ?? 0,
      occupancyPct: null,
      faltas: 0,
    }
    return {
      ...r,
      groupName: g.name,
      professionalName: g.professionalProfile.user.name,
    }
  })
}
