import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"
import { checkConflict, formatConflictError } from "@/lib/appointments"
import { z } from "zod"
import { randomBytes } from "crypto"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  professionalProfileId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
})

/**
 * Generates a secure token for appointment actions (confirm/cancel)
 */
function generateToken(): string {
  return randomBytes(32).toString("hex")
}

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
 *
 * Request body:
 * - patientId: string (required)
 * - professionalProfileId: string (optional for professionals, required for admins when not targeting self)
 * - date: string (YYYY-MM-DD) (required)
 * - startTime: string (HH:mm) (required)
 * - duration: number (minutes, optional - defaults to professional's appointmentDuration)
 * - modality: "ONLINE" | "PRESENCIAL" (required)
 * - notes: string (optional)
 *
 * Validations:
 * 1. Professional must exist in the same clinic
 * 2. Patient must exist and be active in the same clinic
 * 3. Time slot must be within professional's availability rules
 * 4. No double-booking (overlapping appointments)
 * 5. No booking during blocked exceptions
 */
export const POST = withAuth(
  { resource: "appointment", action: "create" },
  async (req, { user, scope }) => {
    const body = await req.json()

    // Validate request body
    const validation = createAppointmentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { patientId, date, startTime, duration, modality, notes } = validation.data

    // Determine professionalProfileId
    let targetProfessionalProfileId = validation.data.professionalProfileId

    // If professional doesn't specify professionalProfileId, use their own
    if (!targetProfessionalProfileId && user.professionalProfileId) {
      targetProfessionalProfileId = user.professionalProfileId
    }

    if (!targetProfessionalProfileId) {
      return NextResponse.json(
        { error: "professionalProfileId is required" },
        { status: 400 }
      )
    }

    // Validate that the professional belongs to the same clinic
    const professional = await prisma.professionalProfile.findFirst({
      where: {
        id: targetProfessionalProfileId,
        user: {
          clinicId: user.clinicId,
        },
      },
      select: {
        id: true,
        appointmentDuration: true,
        bufferBetweenSlots: true,
        user: {
          select: {
            name: true,
          },
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
    if (scope === "own" && targetProfessionalProfileId !== user.professionalProfileId) {
      return NextResponse.json(
        { error: "You can only create appointments for yourself" },
        { status: 403 }
      )
    }

    // Validate that the patient belongs to the same clinic and is active
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId: user.clinicId,
        isActive: true,
      },
    })

    if (!patient) {
      return NextResponse.json(
        { error: "Patient not found or inactive in your clinic" },
        { status: 404 }
      )
    }

    // Calculate appointment times
    const appointmentDuration = duration || professional.appointmentDuration

    const scheduledAt = new Date(`${date}T${startTime}:00`)
    const endAt = new Date(scheduledAt.getTime() + appointmentDuration * 60 * 1000)
    const endTime = `${String(endAt.getHours()).padStart(2, "0")}:${String(endAt.getMinutes()).padStart(2, "0")}`

    // Validate appointment date is not in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const appointmentDate = new Date(date)
    appointmentDate.setHours(0, 0, 0, 0)

    if (appointmentDate < today) {
      return NextResponse.json(
        { error: "Cannot schedule appointments in the past" },
        { status: 400 }
      )
    }

    // Get day of week for the appointment
    const dayOfWeek = new Date(`${date}T12:00:00`).getDay()

    // 1. Validate against availability rules
    const availabilityRules = await prisma.availabilityRule.findMany({
      where: {
        professionalProfileId: targetProfessionalProfileId,
        dayOfWeek,
        isActive: true,
      },
    })

    if (availabilityRules.length === 0) {
      return NextResponse.json(
        { error: "Professional is not available on this day" },
        { status: 400 }
      )
    }

    // Check if the appointment time falls within any availability rule
    const isWithinAvailability = availabilityRules.some((rule) => {
      return startTime >= rule.startTime && endTime <= rule.endTime
    })

    if (!isWithinAvailability) {
      return NextResponse.json(
        { error: "Appointment time is outside of professional's availability hours" },
        { status: 400 }
      )
    }

    // 2. Validate against availability exceptions (blocks)
    const exceptions = await prisma.availabilityException.findMany({
      where: {
        professionalProfileId: targetProfessionalProfileId,
        date: new Date(date),
        isAvailable: false, // Only check blocks
      },
    })

    for (const exception of exceptions) {
      // Full-day block
      if (!exception.startTime || !exception.endTime) {
        return NextResponse.json(
          { error: exception.reason || "Professional is not available on this date" },
          { status: 400 }
        )
      }

      // Time-specific block - check for overlap
      if (startTime < exception.endTime && endTime > exception.startTime) {
        return NextResponse.json(
          { error: exception.reason || "This time slot is blocked" },
          { status: 400 }
        )
      }
    }

    // Create the appointment with tokens using transaction with conflict check
    const confirmToken = generateToken()
    const cancelToken = generateToken()
    const tokenExpiry = new Date(scheduledAt.getTime() - 60 * 60 * 1000) // 1 hour before appointment

    // Use transaction with database-level locking to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // 3. Validate against existing appointments (no double-booking) with row-level locking
      const conflictResult = await checkConflict({
        professionalProfileId: targetProfessionalProfileId,
        scheduledAt,
        endAt,
        bufferMinutes: professional.bufferBetweenSlots || 0,
      }, tx)

      if (conflictResult.hasConflict && conflictResult.conflictingAppointment) {
        return { conflict: conflictResult.conflictingAppointment }
      }

      const newAppointment = await tx.appointment.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: targetProfessionalProfileId,
          patientId,
          scheduledAt,
          endAt,
          modality,
          notes: notes || null,
        },
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
      })

      // Create tokens for confirm/cancel actions
      await tx.appointmentToken.createMany({
        data: [
          {
            appointmentId: newAppointment.id,
            token: confirmToken,
            action: "confirm",
            expiresAt: tokenExpiry,
          },
          {
            appointmentId: newAppointment.id,
            token: cancelToken,
            action: "cancel",
            expiresAt: tokenExpiry,
          },
        ],
      })

      // Update patient's lastVisitAt if this is a future appointment
      await tx.patient.update({
        where: { id: patientId },
        data: { lastVisitAt: new Date() },
      })

      return { appointment: newAppointment }
    })

    // Check if conflict was detected within the transaction
    if ("conflict" in result && result.conflict) {
      return NextResponse.json(
        formatConflictError(result.conflict),
        { status: 409 }
      )
    }

    // Return appointment with token info
    return NextResponse.json({
      appointment: result.appointment,
      tokens: {
        confirm: confirmToken,
        cancel: cancelToken,
        expiresAt: tokenExpiry,
      },
    }, { status: 201 })
  }
)
