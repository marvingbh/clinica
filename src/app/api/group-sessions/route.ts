import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"

/**
 * GET /api/group-sessions
 * Fetch aggregated group sessions for a date (or date range)
 * Returns one entry per unique (groupId, scheduledAt) with participant count
 */
export const GET = withAuth(
  { resource: "appointment", action: "read" },
  async (req: NextRequest, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const professionalProfileId = searchParams.get("professionalProfileId")

    // Build date filter
    let dateFilter: { gte: Date; lt?: Date; lte?: Date }
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
    } else {
      return NextResponse.json(
        { error: "Either 'date' or 'startDate' and 'endDate' are required" },
        { status: 400 }
      )
    }

    // Build where clause
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      groupId: { not: null },
      scheduledAt: dateFilter,
      status: { notIn: ["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL"] },
    }

    // Filter by professional if scope is "own" or if explicitly requested
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (professionalProfileId) {
      where.professionalProfileId = professionalProfileId
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
        sessionMap.set(key, {
          groupId: apt.groupId,
          groupName: apt.group.name,
          scheduledAt: apt.scheduledAt.toISOString(),
          endAt: apt.endAt.toISOString(),
          professionalProfileId: apt.group.professionalProfile.id,
          professionalName: apt.group.professionalProfile.user.name,
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
    const groupSessions = Array.from(sessionMap.values()).sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )

    return NextResponse.json({ groupSessions })
  }
)
