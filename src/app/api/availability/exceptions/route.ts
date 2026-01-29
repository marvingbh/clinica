import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const createExceptionSchema = z.object({
  professionalProfileId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  isAvailable: z.boolean().default(false),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").nullable().optional(),
  endTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
})

/**
 * GET /api/availability/exceptions
 * Returns availability exceptions for a date range
 */
export const GET = withAuth(
  { resource: "availability-exception", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const professionalProfileId = searchParams.get("professionalProfileId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    // Determine which professional's exceptions to return
    let targetProfileId: string | null = null

    if (professionalProfileId && scope === "clinic") {
      // ADMIN can view any professional's exceptions
      const profile = await prisma.professionalProfile.findFirst({
        where: {
          id: professionalProfileId,
          user: { clinicId: user.clinicId },
        },
      })

      if (!profile) {
        return NextResponse.json(
          { error: "Professional not found" },
          { status: 404 }
        )
      }

      targetProfileId = professionalProfileId
    } else if (user.professionalProfileId) {
      // PROFESSIONAL can only view their own exceptions
      targetProfileId = user.professionalProfileId
    } else {
      // ADMIN without specifying a professional - return empty
      return NextResponse.json({ exceptions: [] })
    }

    // Build date filter (parse as local time by appending time component)
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (startDate) {
      dateFilter.gte = new Date(startDate + "T00:00:00")
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate + "T23:59:59.999")
    }

    const exceptions = await prisma.availabilityException.findMany({
      where: {
        professionalProfileId: targetProfileId,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        date: true,
        isAvailable: true,
        startTime: true,
        endTime: true,
        reason: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ exceptions })
  }
)

/**
 * POST /api/availability/exceptions
 * Creates a new availability exception (block or override)
 */
export const POST = withAuth(
  { resource: "availability-exception", action: "create" },
  async (req, { user, scope }) => {
    const body = await req.json()

    const validation = createExceptionSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { professionalProfileId, date, isAvailable, startTime, endTime, reason } = validation.data

    // Determine target professional profile
    let targetProfileId: string | null = null

    if (professionalProfileId && scope === "clinic") {
      // ADMIN can create exceptions for any professional
      const profile = await prisma.professionalProfile.findFirst({
        where: {
          id: professionalProfileId,
          user: { clinicId: user.clinicId },
        },
      })

      if (!profile) {
        return NextResponse.json(
          { error: "Professional not found" },
          { status: 404 }
        )
      }

      targetProfileId = professionalProfileId
    } else if (user.professionalProfileId) {
      // PROFESSIONAL can only create exceptions for themselves
      targetProfileId = user.professionalProfileId
    } else {
      return forbiddenResponse("Cannot create exception without a professional profile")
    }

    // Validate time range if both times are provided
    if (startTime && endTime && startTime >= endTime) {
      return NextResponse.json(
        { error: `Invalid time range: ${startTime} must be before ${endTime}` },
        { status: 400 }
      )
    }

    // If one time is provided, both must be provided
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return NextResponse.json(
        { error: "Both startTime and endTime must be provided together, or both must be null for entire day" },
        { status: 400 }
      )
    }

    // Check for existing exception on the same date with overlapping times
    // Parse date as local time by appending time component
    const existingExceptions = await prisma.availabilityException.findMany({
      where: {
        professionalProfileId: targetProfileId,
        date: new Date(date + "T00:00:00"),
      },
    })

    // Check for conflicts
    for (const existing of existingExceptions) {
      // If either is a full-day exception, there's a conflict
      if (!existing.startTime || !startTime) {
        return NextResponse.json(
          { error: "An exception already exists for this date" },
          { status: 409 }
        )
      }

      // Check for time overlap
      if (startTime && endTime && existing.startTime && existing.endTime) {
        const newStart = startTime
        const newEnd = endTime
        const existingStart = existing.startTime
        const existingEnd = existing.endTime

        if (newStart < existingEnd && newEnd > existingStart) {
          return NextResponse.json(
            { error: "Time range overlaps with an existing exception" },
            { status: 409 }
          )
        }
      }
    }

    const exception = await prisma.availabilityException.create({
      data: {
        professionalProfileId: targetProfileId,
        date: new Date(date + "T00:00:00"),
        isAvailable,
        startTime: startTime || null,
        endTime: endTime || null,
        reason: reason || null,
      },
      select: {
        id: true,
        date: true,
        isAvailable: true,
        startTime: true,
        endTime: true,
        reason: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ exception }, { status: 201 })
  }
)
