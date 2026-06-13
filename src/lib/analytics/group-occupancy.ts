export interface GroupSessionSlim {
  /** groupId|sessionGroupId + scheduledAt — one distinct session per key. */
  groupKey: string
  groupId: string
  scheduledAt: Date
  status: string
}

export interface GroupOccupancyRow {
  groupId: string
  sessions: number
  avgPresent: number
  capacity: number
  occupancyPct: number | null
  faltas: number
}

const CANCELLED_BY_PROF = "CANCELADO_PROFISSIONAL"
const FALTA = "CANCELADO_FALTA"

/**
 * Per-group occupancy from per-member appointment rows.
 *
 * A session = a distinct groupKey. Sessions cancelled by the professional are
 * excluded from the denominator entirely (the session didn't happen).
 * "Present" = rows that are not cancelled (AGENDADO/CONFIRMADO/FINALIZADO).
 * Capacity falls back to active members when not explicitly set.
 * occupancyPct = avgPresent ÷ capacity (null when capacity is 0/unknown).
 */
export function groupOccupancy(args: {
  memberAppointments: GroupSessionSlim[]
  capacityByGroup: Map<string, number | null>
  activeMembersByGroup: Map<string, number>
}): GroupOccupancyRow[] {
  const { memberAppointments, capacityByGroup, activeMembersByGroup } = args

  // group -> session key -> { present, faltas, allCancelledByProf flag }
  const groups = new Map<
    string,
    Map<string, { present: number; faltas: number; profCancelled: boolean }>
  >()

  for (const a of memberAppointments) {
    let sessions = groups.get(a.groupId)
    if (!sessions) {
      sessions = new Map()
      groups.set(a.groupId, sessions)
    }
    let s = sessions.get(a.groupKey)
    if (!s) {
      s = { present: 0, faltas: 0, profCancelled: false }
      sessions.set(a.groupKey, s)
    }
    if (a.status === CANCELLED_BY_PROF) {
      s.profCancelled = true
    } else if (a.status === FALTA) {
      s.faltas++
    } else {
      s.present++
    }
  }

  const rows: GroupOccupancyRow[] = []
  for (const [groupId, sessions] of groups) {
    let sessionCount = 0
    let totalPresent = 0
    let faltas = 0
    for (const s of sessions.values()) {
      // A session counts unless EVERY member row was cancelled by the professional.
      if (s.profCancelled && s.present === 0 && s.faltas === 0) continue
      sessionCount++
      totalPresent += s.present
      faltas += s.faltas
    }

    const explicit = capacityByGroup.get(groupId)
    const capacity =
      explicit != null && explicit > 0
        ? explicit
        : activeMembersByGroup.get(groupId) ?? 0

    const avgPresent = sessionCount === 0 ? 0 : totalPresent / sessionCount
    const occupancyPct = capacity > 0 ? avgPresent / capacity : null

    rows.push({ groupId, sessions: sessionCount, avgPresent, capacity, occupancyPct, faltas })
  }

  return rows
}
