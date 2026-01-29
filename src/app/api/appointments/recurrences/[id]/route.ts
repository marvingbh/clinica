import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { createAuditLog } from "@/lib/rbac/audit"
import { RecurrenceType, RecurrenceEndType, AppointmentStatus, AppointmentModality } from "@/generated/prisma/client"
import { z } from "zod"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateRecurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  endTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).optional(),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES", "INDEFINITE"]).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  occurrences: z.number().int().min(1).max(52).optional().nullable(),
  applyTo: z.enum(["future"]).optional(), // Only "future" is supported for now
})

/**
 * GET /api/appointments/recurrences/:id
 * Get recurrence details with future appointments
 */
export const GET = withAuth(
  {
    resource: "appointment",
    action: "read",
  },
  async (req, { user, scope }) => {
    const url = new URL(req.url)
    const pathParts = url.pathname.split("/")
    const recurrenceId = pathParts[pathParts.indexOf("recurrences") + 1]

    const recurrence = await prisma.appointmentRecurrence.findFirst({
      where: {
        id: recurrenceId,
        clinicId: user.clinicId,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
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
        appointments: {
          where: {
            scheduledAt: {
              gte: new Date(),
            },
            status: {
              in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
            },
          },
          orderBy: {
            scheduledAt: "asc",
          },
          select: {
            id: true,
            scheduledAt: true,
            endAt: true,
            status: true,
            modality: true,
          },
        },
      },
    })

    if (!recurrence) {
      return NextResponse.json(
        { error: "Recorrencia nao encontrada" },
        { status: 404 }
      )
    }

    // Check ownership for "own" scope
    if (scope === "own" && recurrence.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Voce so pode visualizar suas proprias recorrencias")
    }

    return NextResponse.json({
      recurrence: {
        id: recurrence.id,
        recurrenceType: recurrence.recurrenceType,
        recurrenceEndType: recurrence.recurrenceEndType,
        dayOfWeek: recurrence.dayOfWeek,
        startTime: recurrence.startTime,
        endTime: recurrence.endTime,
        duration: recurrence.duration,
        modality: recurrence.modality,
        startDate: recurrence.startDate,
        endDate: recurrence.endDate,
        occurrences: recurrence.occurrences,
        lastGeneratedDate: recurrence.lastGeneratedDate,
        exceptions: recurrence.exceptions,
        isActive: recurrence.isActive,
        patient: recurrence.patient,
        professionalProfile: recurrence.professionalProfile,
        futureAppointments: recurrence.appointments,
      },
    })
  }
)

/**
 * PATCH /api/appointments/recurrences/:id
 * Update recurrence settings
 *
 * Request body:
 * - recurrenceType: "WEEKLY" | "BIWEEKLY" | "MONTHLY" (optional)
 * - startTime: string (HH:mm) (optional)
 * - endTime: string (HH:mm) (optional)
 * - modality: "ONLINE" | "PRESENCIAL" (optional)
 * - recurrenceEndType: "BY_DATE" | "BY_OCCURRENCES" | "INDEFINITE" (optional)
 * - endDate: string (YYYY-MM-DD) (optional, for BY_DATE)
 * - occurrences: number (optional, for BY_OCCURRENCES)
 * - applyTo: "future" (optional, apply changes to future appointments only)
 */
export const PATCH = withAuth(
  {
    resource: "appointment",
    action: "update",
  },
  async (req, { user, scope }) => {
    const url = new URL(req.url)
    const pathParts = url.pathname.split("/")
    const recurrenceId = pathParts[pathParts.indexOf("recurrences") + 1]

    let body: z.infer<typeof updateRecurrenceSchema>
    try {
      const rawBody = await req.json()
      const validation = updateRecurrenceSchema.safeParse(rawBody)
      if (!validation.success) {
        return NextResponse.json(
          { error: "Dados invalidos", details: validation.error.flatten() },
          { status: 400 }
        )
      }
      body = validation.data
    } catch {
      return NextResponse.json(
        { error: "Requisicao invalida" },
        { status: 400 }
      )
    }

    // Fetch the recurrence
    const recurrence = await prisma.appointmentRecurrence.findFirst({
      where: {
        id: recurrenceId,
        clinicId: user.clinicId,
      },
      include: {
        appointments: {
          where: {
            scheduledAt: {
              gte: new Date(),
            },
            status: {
              in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO],
            },
          },
        },
      },
    })

    if (!recurrence) {
      return NextResponse.json(
        { error: "Recorrencia nao encontrada" },
        { status: 404 }
      )
    }

    // Check ownership for "own" scope
    if (scope === "own" && recurrence.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Voce so pode modificar suas proprias recorrencias")
    }

    if (!recurrence.isActive) {
      return NextResponse.json(
        { error: "Recorrencia esta inativa" },
        { status: 400 }
      )
    }

    // Validate recurrence end type consistency
    if (body.recurrenceEndType === "BY_DATE" && !body.endDate && !recurrence.endDate) {
      return NextResponse.json(
        { error: "Data final e obrigatoria para tipo BY_DATE" },
        { status: 400 }
      )
    }

    if (body.recurrenceEndType === "BY_OCCURRENCES" && !body.occurrences && !recurrence.occurrences) {
      return NextResponse.json(
        { error: "Numero de ocorrencias e obrigatorio para tipo BY_OCCURRENCES" },
        { status: 400 }
      )
    }

    const oldValues = {
      recurrenceType: recurrence.recurrenceType,
      startTime: recurrence.startTime,
      endTime: recurrence.endTime,
      modality: recurrence.modality,
      recurrenceEndType: recurrence.recurrenceEndType,
      endDate: recurrence.endDate,
      occurrences: recurrence.occurrences,
    }

    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    // Prepare update data for recurrence
    const updateData: {
      recurrenceType?: RecurrenceType
      startTime?: string
      endTime?: string
      modality?: AppointmentModality
      recurrenceEndType?: RecurrenceEndType
      endDate?: Date | null
      occurrences?: number | null
      lastGeneratedDate?: Date | null
    } = {}

    if (body.recurrenceType) {
      updateData.recurrenceType = body.recurrenceType as RecurrenceType
    }
    if (body.startTime) {
      updateData.startTime = body.startTime
    }
    if (body.endTime) {
      updateData.endTime = body.endTime
    }
    if (body.modality) {
      updateData.modality = body.modality as AppointmentModality
    }
    if (body.recurrenceEndType) {
      updateData.recurrenceEndType = body.recurrenceEndType as RecurrenceEndType

      // Clear lastGeneratedDate if changing away from INDEFINITE
      if (body.recurrenceEndType !== "INDEFINITE" && recurrence.recurrenceEndType === RecurrenceEndType.INDEFINITE) {
        updateData.lastGeneratedDate = null
      }
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate ? new Date(body.endDate) : null
    }
    if (body.occurrences !== undefined) {
      updateData.occurrences = body.occurrences
    }

    // If no updates provided, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nenhuma alteracao fornecida" },
        { status: 400 }
      )
    }

    // Apply changes
    const applyToFuture = body.applyTo === "future"
    let updatedAppointmentsCount = 0

    await prisma.$transaction(async (tx) => {
      // Update the recurrence record
      await tx.appointmentRecurrence.update({
        where: { id: recurrenceId },
        data: updateData,
      })

      // If applyTo is "future", update future appointments
      if (applyToFuture && recurrence.appointments.length > 0) {
        const appointmentUpdateData: {
          scheduledAt?: Date
          endAt?: Date
          modality?: AppointmentModality
        } = {}

        // Update modality if provided
        if (body.modality) {
          appointmentUpdateData.modality = body.modality as AppointmentModality
        }

        // Update times if startTime or endTime changed
        if (body.startTime || body.endTime) {
          for (const apt of recurrence.appointments) {
            const aptDate = new Date(apt.scheduledAt)
            const dateStr = aptDate.toISOString().split("T")[0]

            const newStartTime = body.startTime || recurrence.startTime
            const newEndTime = body.endTime || recurrence.endTime

            const [startHours, startMinutes] = newStartTime.split(":").map(Number)
            const [endHours, endMinutes] = newEndTime.split(":").map(Number)

            const newScheduledAt = new Date(`${dateStr}T${newStartTime}:00`)
            const newEndAt = new Date(`${dateStr}T${newEndTime}:00`)

            // Adjust for timezone
            newScheduledAt.setHours(startHours, startMinutes, 0, 0)
            newEndAt.setHours(endHours, endMinutes, 0, 0)

            await tx.appointment.update({
              where: { id: apt.id },
              data: {
                scheduledAt: newScheduledAt,
                endAt: newEndAt,
                ...(body.modality && { modality: body.modality as AppointmentModality }),
              },
            })
            updatedAppointmentsCount++
          }
        } else if (body.modality) {
          // Only update modality
          await tx.appointment.updateMany({
            where: {
              id: {
                in: recurrence.appointments.map((apt) => apt.id),
              },
            },
            data: {
              modality: body.modality as AppointmentModality,
            },
          })
          updatedAppointmentsCount = recurrence.appointments.length
        }
      }
    })

    // Create audit log
    await createAuditLog({
      user,
      action: "RECURRENCE_UPDATED",
      entityType: "AppointmentRecurrence",
      entityId: recurrenceId,
      oldValues,
      newValues: {
        ...updateData,
        applyTo: body.applyTo,
        updatedAppointmentsCount,
      },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      message: "Recorrencia atualizada com sucesso",
      updatedAppointmentsCount,
    })
  }
)
