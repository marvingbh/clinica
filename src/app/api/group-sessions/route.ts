import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"

interface SessionEntry {
  groupId: string | null
  sessionGroupId: string | null
  groupName: string
  isOneOff: boolean
  scheduledAt: string
  endAt: string
  professionalProfileId: string
  professionalName: string
  additionalProfessionals: Array<{
    professionalProfileId: string
    professionalName: string
  }>
  participants: Array<{
    appointmentId: string
    patientId: string
    patientName: string
    status: string
  }>
}

/**
 * GET /api/group-sessions
 * Fetch aggregated group sessions for a date (or date range)
 * Returns one entry per unique (groupId, scheduledAt) or (sessionGroupId, scheduledAt)
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const professionalProfileId = searchParams.get("professionalProfileId")
    const groupId = searchParams.get("groupId")
    const filter = searchParams.get("filter") || "all" // "upcoming" | "past" | "all"
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)))

    // Build date filter
    let dateFilter: { gte: Date; lt?: Date; lte?: Date } | undefined
    if (date) {
      const dayStart = new Date(date + "T00:00:00")
      const dayEnd = new Date(date + "T23:59:59.999")
      dateFilter = { gte: dayStart, lte: dayEnd }
    } else if (startDate && endDate) {
      dateFilter = {
        gte: new Date(startDate + "T00:00:00"),
        lte: new Date(endDate + "T23:59:59.999"),
      }
    } else if (!groupId) {
      return NextResponse.json(
        { error: "Either 'date', 'startDate'+'endDate', or 'groupId' is required" },
        { status: 400 }
      )
    }

    // Build where clause — include both recurring (groupId) and one-off (sessionGroupId)
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (groupId) {
      where.groupId = groupId
    } else {
      // Fetch appointments belonging to either a recurring group or a one-off group
      where.OR = [
        { groupId: { not: null } },
        { sessionGroupId: { not: null } },
      ]
    }

    // Apply time-based filter (upcoming/past)
    const referenceDateParam = searchParams.get("referenceDate")
    const now = referenceDateParam ? new Date(referenceDateParam + "T00:00:00") : new Date()
    if (filter === "upcoming") {
      if (dateFilter) {
        dateFilter.gte = dateFilter.gte > now ? dateFilter.gte : now
      } else {
        dateFilter = { gte: now }
      }
    } else if (filter === "past") {
      if (dateFilter) {
        const filterEnd = dateFilter.lte || dateFilter.lt
        if (!filterEnd || filterEnd > now) {
          delete dateFilter.lte
          dateFilter.lt = now
        }
      } else {
        dateFilter = { gte: new Date(0), lt: now }
      }
    }

    if (dateFilter) {
      where.scheduledAt = dateFilter
    }

    // Filter by professional if user cannot see others' or if explicitly requested
    const profFilter = !canSeeOthers && user.professionalProfileId
      ? [
          { professionalProfileId: user.professionalProfileId },
          { additionalProfessionals: { some: { professionalProfileId: user.professionalProfileId } } },
        ]
      : professionalProfileId
        ? [
            { professionalProfileId },
            { additionalProfessionals: { some: { professionalProfileId } } },
          ]
        : null

    // Merge professional filter with existing OR (group type filter)
    if (profFilter) {
      const existingOR = where.OR as Record<string, unknown>[] | undefined
      if (existingOR) {
        // Need both conditions: (groupId OR sessionGroupId) AND (profA OR profB)
        where.AND = [
          { OR: existingOR },
          { OR: profFilter },
        ]
        delete where.OR
      } else {
        where.OR = profFilter
      }
    }

    // Get all group appointments
    const groupAppointments = await prisma.appointment.findMany({
      where,
      select: {
        id: true,
        groupId: true,
        sessionGroupId: true,
        title: true,
        professionalProfileId: true,
        scheduledAt: true,
        endAt: true,
        status: true,
        patient: {
          select: { id: true, name: true },
        },
        professionalProfile: {
          select: {
            id: true,
            user: { select: { name: true } },
          },
        },
        additionalProfessionals: {
          select: {
            professionalProfile: {
              select: { id: true, user: { select: { name: true } } },
            },
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            professionalProfile: {
              select: {
                id: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    })

    // Aggregate by (groupId + scheduledAt) or (sessionGroupId + scheduledAt)
    const sessionMap = new Map<string, SessionEntry>()
    const cancelledStatuses = ["CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO", "CANCELADO_FALTA"]

    for (const apt of groupAppointments) {
      let key: string
      let isOneOff: boolean

      if (apt.groupId && apt.group) {
        key = `group:${apt.groupId}:${apt.scheduledAt.toISOString()}`
        isOneOff = false
      } else if (apt.sessionGroupId) {
        key = `session:${apt.sessionGroupId}:${apt.scheduledAt.toISOString()}`
        isOneOff = true
      } else {
        continue
      }

      if (!sessionMap.has(key)) {
        const addlProfs = apt.additionalProfessionals.map(ap => ({
          professionalProfileId: ap.professionalProfile.id,
          professionalName: ap.professionalProfile.user.name,
        }))

        const profId = isOneOff
          ? apt.professionalProfile.id
          : apt.group!.professionalProfile.id
        const profName = isOneOff
          ? apt.professionalProfile.user.name
          : apt.group!.professionalProfile.user.name

        sessionMap.set(key, {
          groupId: apt.groupId,
          sessionGroupId: apt.sessionGroupId,
          groupName: isOneOff ? (apt.title || "Sessão em Grupo") : apt.group!.name,
          isOneOff,
          scheduledAt: apt.scheduledAt.toISOString(),
          endAt: apt.endAt.toISOString(),
          professionalProfileId: profId,
          professionalName: profName,
          additionalProfessionals: addlProfs,
          participants: [],
        })
      }

      if (apt.patient) {
        const session = sessionMap.get(key)!
        const existing = session.participants.find(p => p.patientId === apt.patient!.id)
        if (existing) {
          if (cancelledStatuses.includes(existing.status) && !cancelledStatuses.includes(apt.status)) {
            existing.appointmentId = apt.id
            existing.status = apt.status
          }
        } else {
          session.participants.push({
            appointmentId: apt.id,
            patientId: apt.patient.id,
            patientName: apt.patient.name,
            status: apt.status,
          })
        }
      }
    }

    // Convert to array and sort by time
    const allSessions = Array.from(sessionMap.values()).sort((a, b) => {
      const diff = new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      return filter === "past" ? -diff : diff
    })

    // Paginate aggregated sessions
    const total = allSessions.length
    const start = (page - 1) * limit
    const groupSessions = allSessions.slice(start, start + limit)

    return NextResponse.json({ groupSessions, total, page, limit })
  }
)
