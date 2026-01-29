import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"

/**
 * GET /api/appointments
 * List appointments - ADMIN sees all clinic appointments, PROFESSIONAL sees only their own
 */
export const GET = withAuth(
  { resource: "appointment", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const date = searchParams.get("date") // Single day filter (YYYY-MM-DD)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const professionalProfileId = searchParams.get("professionalProfileId")

    // Base query always filters by clinic for multi-tenant isolation
    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // If scope is "own", filter to only the professional's appointments
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (professionalProfileId && scope === "clinic") {
      // ADMIN can filter by specific professional
      where.professionalProfileId = professionalProfileId
    }

    // Apply optional filters
    if (status) {
      where.status = status
    }

    // Single date filter (for daily view)
    if (date) {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      where.scheduledAt = {
        gte: dayStart,
        lte: dayEnd,
      }
    } else {
      // Range filters
      if (startDate) {
        where.scheduledAt = {
          ...(where.scheduledAt as Record<string, unknown>),
          gte: new Date(startDate),
        }
      }

      if (endDate) {
        where.scheduledAt = {
          ...(where.scheduledAt as Record<string, unknown>),
          lte: new Date(endDate),
        }
      }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
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
      orderBy: {
        scheduledAt: "asc",
      },
    })

    return NextResponse.json({ appointments })
  }
)

/**
 * POST /api/appointments
 * Create a new appointment - ADMIN can create for any professional, PROFESSIONAL only for themselves
 */
export const POST = withAuth(
  { resource: "appointment", action: "create" },
  async (req, { user, scope }) => {
    const body = await req.json()
    const { patientId, professionalProfileId, scheduledAt, endAt, modality, notes } = body

    // Validate that the professional belongs to the same clinic
    const professional = await prisma.professionalProfile.findFirst({
      where: {
        id: professionalProfileId,
        user: {
          clinicId: user.clinicId,
        },
      },
    })

    if (!professional) {
      return NextResponse.json(
        { error: "Professional not found in your clinic" },
        { status: 404 }
      )
    }

    // If scope is "own", professional can only create appointments for themselves
    if (scope === "own" && professionalProfileId !== user.professionalProfileId) {
      return NextResponse.json(
        { error: "You can only create appointments for yourself" },
        { status: 403 }
      )
    }

    // Validate that the patient belongs to the same clinic
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId: user.clinicId,
      },
    })

    if (!patient) {
      return NextResponse.json(
        { error: "Patient not found in your clinic" },
        { status: 404 }
      )
    }

    const appointment = await prisma.appointment.create({
      data: {
        clinicId: user.clinicId,
        professionalProfileId,
        patientId,
        scheduledAt: new Date(scheduledAt),
        endAt: new Date(endAt),
        modality,
        notes,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
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
    })

    return NextResponse.json({ appointment }, { status: 201 })
  }
)
