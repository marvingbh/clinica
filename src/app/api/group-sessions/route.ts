import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"

/**
 * GET /api/group-sessions
 * Fetch aggregated group sessions for a date (or date range)
 * Returns one entry per unique (groupId, scheduledAt) with participant count
 */
export const GET = withFeatureAuth(
  { feature: "groups", minAccess: "READ" },
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
      // Single date query
      const dayStart = new Date(date + "T00:00:00")
      const dayEnd = new Date(date + "T23:59:59.999")
      dateFilter = { gte: dayStart, lte: dayEnd }
    } else if (startDate && endDate) {
      // Date range query
      dateFilter = {
        gte: new Date(startDate + "T00:00:00"),
        lte: new Date(endDate + "T23:59:59.999"),
      }
    } else if (!groupId) {
      // Date params required unless filtering by groupId
      return NextResponse.json(
        { error: "Either 'date', 'startDate'+'endDate', or 'groupId' is required" },
        { status: 400 }
      )
    }

    // Build where clause
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      groupId: groupId ? groupId : { not: null },
      status: { notIn: ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"] },
    }

    // Apply time-based filter (upcoming/past)
    // referenceDate lets the client override "now" for navigation (e.g. "ir para data")
    const referenceDateParam = searchParams.get("referenceDate")
    const now = referenceDateParam ? new Date(referenceDateParam + "T00:00:00") : new Date()
    if (filter === "upcoming") {
      if (dateFilter) {
        // Merge: use the later of dateFilter.gte and now
        dateFilter.gte = dateFilter.gte > now ? dateFilter.gte : now
      } else {
        dateFilter = { gte: now }
      }
    } else if (filter === "past") {
      if (dateFilter) {
        // Merge: use the earlier of dateFilter.lte and now
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
    if (!canSeeOthers && user.professionalProfileId) {
      where.OR = [
        { professionalProfileId: user.professionalProfileId },
        { additionalProfessionals: { some: { professionalProfileId: user.professionalProfileId } } },
      ]
    } else if (professionalProfileId) {
      where.OR = [
        { professionalProfileId },
        { additionalProfessionals: { some: { professionalProfileId } } },
      ]
    }

    // Get all group appointments for the date
    const groupAppointments = await prisma.appointment.findMany({
      where,
      select: {
        id: true,
        groupId: true,
        scheduledAt: true,
        endAt: true,
        status: true,
        patient: {
          select: {
            id: true,
            name: true,
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
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
    })

    // Aggregate by groupId + scheduledAt
    const sessionMap = new Map<
      string,
      {
        groupId: string
        groupName: string
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
    >()

    for (const apt of groupAppointments) {
      if (!apt.groupId || !apt.group) continue

      const key = `${apt.groupId}:${apt.scheduledAt.toISOString()}`

      if (!sessionMap.has(key)) {
        // Get additional professionals from first appointment in session
        const addlProfs = apt.additionalProfessionals.map(ap => ({
          professionalProfileId: ap.professionalProfile.id,
          professionalName: ap.professionalProfile.user.name,
        }))
        sessionMap.set(key, {
          groupId: apt.groupId,
          groupName: apt.group.name,
          scheduledAt: apt.scheduledAt.toISOString(),
          endAt: apt.endAt.toISOString(),
          professionalProfileId: apt.group.professionalProfile.id,
          professionalName: apt.group.professionalProfile.user.name,
          additionalProfessionals: addlProfs,
          participants: [],
        })
      }

      if (apt.patient) {
        sessionMap.get(key)!.participants.push({
          appointmentId: apt.id,
          patientId: apt.patient.id,
          patientName: apt.patient.name,
          status: apt.status,
        })
      }
    }

    // Convert to array and sort by time
    const allSessions = Array.from(sessionMap.values()).sort((a, b) => {
      const diff = new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      // For past filter, show most recent first
      return filter === "past" ? -diff : diff
    })

    // Paginate aggregated sessions
    const total = allSessions.length
    const start = (page - 1) * limit
    const groupSessions = allSessions.slice(start, start + limit)

    return NextResponse.json({ groupSessions, total, page, limit })
  }
)
