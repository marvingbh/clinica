import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const createExceptionSchema = z.object({
  professionalProfileId: z.string().nullable().optional(),
  isClinicWide: z.boolean().default(false),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  isRecurring: z.boolean().default(false),
  isAvailable: z.boolean().default(false),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").nullable().optional(),
  endTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
})

/**
 * GET /api/availability/exceptions
 * Returns availability exceptions for a date range
 * Includes both professional-specific and clinic-wide exceptions
 */
export const GET = withAuth(
  { resource: "availability-exception", action: "list" },
  async (req, { user, scope }) => {
    const { searchParams } = new URL(req.url)
    const professionalProfileId = searchParams.get("professionalProfileId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const includeClinicWide = searchParams.get("includeClinicWide") !== "false" // default true

    // Build date filter (parse as local time by appending time component)
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (startDate) {
      dateFilter.gte = new Date(startDate + "T00:00:00")
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate + "T23:59:59.999")
    }

    type ExceptionResult = {
      id: string
      date: Date | null
      dayOfWeek: number | null
      isRecurring: boolean
      isAvailable: boolean
      startTime: string | null
      endTime: string | null
      reason: string | null
      createdAt: Date
      isClinicWide: boolean
      professionalName: string | null
    }

    const exceptions: ExceptionResult[] = []

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
    }

    // Fetch clinic-wide exceptions ONCE (reused below if needed)
    let clinicWideExceptions: Array<{
      id: string
      date: Date | null
      dayOfWeek: number | null
      isRecurring: boolean
      isAvailable: boolean
      startTime: string | null
      endTime: string | null
      reason: string | null
      createdAt: Date
    }> = []

    if (includeClinicWide) {
      clinicWideExceptions = await prisma.availabilityException.findMany({
        where: {
          clinicId: user.clinicId,
          professionalProfileId: null,
          isRecurring: false,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          date: true,
          dayOfWeek: true,
          isRecurring: true,
          isAvailable: true,
          startTime: true,
          endTime: true,
          reason: true,
          createdAt: true,
        },
      })
    }

    // For admin listing all exceptions (no specific professional selected)
    if (scope === "clinic" && !professionalProfileId) {
      // Fetch all professional exceptions with names
      const allProfessionalExceptions = await prisma.availabilityException.findMany({
        where: {
          professionalProfile: {
            user: { clinicId: user.clinicId },
          },
          isRecurring: false,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          date: true,
          dayOfWeek: true,
          isRecurring: true,
          isAvailable: true,
          startTime: true,
          endTime: true,
          reason: true,
          createdAt: true,
          professionalProfile: {
            select: {
              user: {
                select: { name: true },
              },
            },
          },
        },
      })

      for (const ex of allProfessionalExceptions) {
        exceptions.push({
          id: ex.id,
          date: ex.date,
          dayOfWeek: ex.dayOfWeek,
          isRecurring: ex.isRecurring,
          isAvailable: ex.isAvailable,
          startTime: ex.startTime,
          endTime: ex.endTime,
          reason: ex.reason,
          createdAt: ex.createdAt,
          isClinicWide: false,
          professionalName: ex.professionalProfile?.user?.name || null,
        })
      }
    } else if (targetProfileId) {
      // Fetch professional-specific exceptions for a specific professional
      const dateExceptions = await prisma.availabilityException.findMany({
        where: {
          professionalProfileId: targetProfileId,
          isRecurring: false,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          date: true,
          dayOfWeek: true,
          isRecurring: true,
          isAvailable: true,
          startTime: true,
          endTime: true,
          reason: true,
          createdAt: true,
        },
      })

      for (const ex of dateExceptions) {
        exceptions.push({
          ...ex,
          isClinicWide: false,
          professionalName: null,
        })
      }
    }

    // Add clinic-wide exceptions (already fetched once above)
    if (includeClinicWide) {
      for (const ex of clinicWideExceptions) {
        exceptions.push({
          ...ex,
          isClinicWide: true,
          professionalName: null,
        })
      }
    }

    // Sort by date
    exceptions.sort((a, b) => {
      if (a.date && b.date) {
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      }
      return 0
    })

    return NextResponse.json({ exceptions })
  }
)

/**
 * POST /api/availability/exceptions
 * Creates a new availability exception (block or override)
 * Can be clinic-wide (affects all professionals) or professional-specific
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

    const { professionalProfileId, isClinicWide, date, dayOfWeek, isRecurring, isAvailable, startTime, endTime, reason } = validation.data

    // Validate that recurring exceptions have dayOfWeek and non-recurring have date
    if (isRecurring && (dayOfWeek === null || dayOfWeek === undefined)) {
      return NextResponse.json(
        { error: "Recurring exceptions require a day of week" },
        { status: 400 }
      )
    }
    if (!isRecurring && !date) {
      return NextResponse.json(
        { error: "Non-recurring exceptions require a date" },
        { status: 400 }
      )
    }

    // Clinic-wide exceptions require admin scope
    if (isClinicWide && scope !== "clinic") {
      return forbiddenResponse("Only administrators can create clinic-wide exceptions")
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

    if (isClinicWide) {
      // Create clinic-wide exception
      if (!isRecurring) {
        // Check for existing clinic-wide exception on the same date
        const existingClinicWide = await prisma.availabilityException.findFirst({
          where: {
            clinicId: user.clinicId,
            professionalProfileId: null,
            isRecurring: false,
            date: new Date(date + "T00:00:00"),
          },
        })

        if (existingClinicWide) {
          // Check for overlap
          if (!existingClinicWide.startTime || !startTime) {
            return NextResponse.json(
              { error: "Já existe um bloqueio para toda a clínica nesta data" },
              { status: 409 }
            )
          }

          if (startTime && endTime && existingClinicWide.startTime && existingClinicWide.endTime) {
            if (startTime < existingClinicWide.endTime && endTime > existingClinicWide.startTime) {
              return NextResponse.json(
                { error: "Horário conflita com um bloqueio existente para toda a clínica" },
                { status: 409 }
              )
            }
          }
        }
      }

      const exception = await prisma.availabilityException.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: null,
          date: isRecurring ? null : new Date(date + "T00:00:00"),
          dayOfWeek: isRecurring ? dayOfWeek : null,
          isRecurring,
          isAvailable,
          startTime: startTime || null,
          endTime: endTime || null,
          reason: reason || null,
        },
        select: {
          id: true,
          date: true,
          dayOfWeek: true,
          isRecurring: true,
          isAvailable: true,
          startTime: true,
          endTime: true,
          reason: true,
          createdAt: true,
        },
      })

      return NextResponse.json({
        exception: {
          ...exception,
          isClinicWide: true,
          professionalName: null,
        },
      }, { status: 201 })
    }

    // Professional-specific exception
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

    // Check for existing exceptions with overlapping times
    if (!isRecurring) {
      const existingExceptions = await prisma.availabilityException.findMany({
        where: {
          professionalProfileId: targetProfileId,
          isRecurring: false,
          date: new Date(date + "T00:00:00"),
        },
      })

      for (const existing of existingExceptions) {
        if (!existing.startTime || !startTime) {
          return NextResponse.json(
            { error: "An exception already exists for this date" },
            { status: 409 }
          )
        }

        if (startTime && endTime && existing.startTime && existing.endTime) {
          if (startTime < existing.endTime && endTime > existing.startTime) {
            return NextResponse.json(
              { error: "Time range overlaps with an existing exception" },
              { status: 409 }
            )
          }
        }
      }
    }

    const exception = await prisma.availabilityException.create({
      data: {
        professionalProfileId: targetProfileId,
        clinicId: null,
        date: isRecurring ? null : new Date(date + "T00:00:00"),
        dayOfWeek: isRecurring ? dayOfWeek : null,
        isRecurring,
        isAvailable,
        startTime: startTime || null,
        endTime: endTime || null,
        reason: reason || null,
      },
      select: {
        id: true,
        date: true,
        dayOfWeek: true,
        isRecurring: true,
        isAvailable: true,
        startTime: true,
        endTime: true,
        reason: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      exception: {
        ...exception,
        isClinicWide: false,
        professionalName: null,
      },
    }, { status: 201 })
  }
)
