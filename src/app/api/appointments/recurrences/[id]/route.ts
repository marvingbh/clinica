import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { createAuditLog } from "@/lib/rbac/audit"
import { RecurrenceType, RecurrenceEndType, AppointmentStatus, AppointmentModality } from "@prisma/client"
import { z } from "zod"
import { calculateDayShiftedDates } from "@/lib/appointments/recurrence"
import { checkConflictsBulk } from "@/lib/appointments/conflict-check"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateRecurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  endTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).optional(),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES", "INDEFINITE"]).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  occurrences: z.number().int().min(1).max(52).optional().nullable(),
  dayOfWeek: z.number().int().min(0).max(6).optional(), // 0 = Sunday, 6 = Saturday
  applyTo: z.enum(["future"]).optional(), // Only "future" is supported for now
  additionalProfessionalIds: z.array(z.string()).optional(),
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

    // Fetch the recurrence with additional professionals
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
        additionalProfessionals: {
          select: { professionalProfileId: true },
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
      dayOfWeek: recurrence.dayOfWeek,
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
      dayOfWeek?: number
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
    if (body.dayOfWeek !== undefined && body.dayOfWeek !== recurrence.dayOfWeek) {
      updateData.dayOfWeek = body.dayOfWeek
    }

    // If no updates provided, return error
    const hasAdditionalProfChange = body.additionalProfessionalIds !== undefined
    if (Object.keys(updateData).length === 0 && !hasAdditionalProfChange) {
      return NextResponse.json(
        { error: "Nenhuma alteracao fornecida" },
        { status: 400 }
      )
    }

    // Handle day of week change with conflict checking
    const isDayOfWeekChange = updateData.dayOfWeek !== undefined
    const dayShiftedAppointments: Array<{
      id: string
      oldScheduledAt: Date
      oldEndAt: Date
      newScheduledAt: Date
      newEndAt: Date
    }> = []

    if (isDayOfWeekChange && recurrence.appointments.length > 0) {
      const newDayOfWeek = updateData.dayOfWeek!
      const currentDayOfWeek = recurrence.dayOfWeek

      // If time is also changing, we need to apply the new time to day-shifted dates
      const newStartTime = updateData.startTime || recurrence.startTime
      const newEndTime = updateData.endTime || recurrence.endTime
      const isAlsoTimeChange = updateData.startTime !== undefined || updateData.endTime !== undefined

      // Pre-calculate all new dates
      const shiftedDates = recurrence.appointments.map(apt => {
        let { scheduledAt: newScheduledAt, endAt: newEndAt } = calculateDayShiftedDates(
          apt.scheduledAt,
          apt.endAt,
          currentDayOfWeek,
          newDayOfWeek
        )

        if (isAlsoTimeChange) {
          const [startHours, startMinutes] = newStartTime.split(":").map(Number)
          const [endHours, endMinutes] = newEndTime.split(":").map(Number)
          newScheduledAt = new Date(newScheduledAt)
          newScheduledAt.setHours(startHours, startMinutes, 0, 0)
          newEndAt = new Date(newEndAt)
          newEndAt.setHours(endHours, endMinutes, 0, 0)
        }

        return { apt, newScheduledAt, newEndAt }
      })

      // Bulk check all conflicts in a single query
      // Use new additional prof IDs if provided, otherwise use existing ones
      const effectiveAdditionalProfIds = body.additionalProfessionalIds
        ?? recurrence.additionalProfessionals.map(ap => ap.professionalProfileId)
      const bulkResult = await checkConflictsBulk({
        professionalProfileId: recurrence.professionalProfileId,
        dates: shiftedDates.map(d => ({ scheduledAt: d.newScheduledAt, endAt: d.newEndAt })),
        excludeAppointmentIds: recurrence.appointments.map(a => a.id),
        additionalProfessionalIds: effectiveAdditionalProfIds,
      })

      // If there are conflicts, fail the operation
      if (bulkResult.conflicts.length > 0) {
        const conflicts = bulkResult.conflicts.map(c => ({
          date: shiftedDates[c.index].newScheduledAt.toLocaleDateString("pt-BR"),
          conflictsWith: c.conflictingAppointment.patientName,
        }))

        return NextResponse.json(
          {
            error: "Conflitos de horario encontrados ao mudar o dia da semana",
            code: "DAY_CHANGE_CONFLICTS",
            conflicts,
          },
          { status: 409 }
        )
      }

      // No conflicts — populate day shifted appointments
      for (const { apt, newScheduledAt, newEndAt } of shiftedDates) {
        dayShiftedAppointments.push({
          id: apt.id,
          oldScheduledAt: apt.scheduledAt,
          oldEndAt: apt.endAt,
          newScheduledAt,
          newEndAt,
        })
      }
    }

    // Handle recurrence type change (WEEKLY <-> BIWEEKLY <-> MONTHLY)
    // When frequency changes, we need to delete appointments that no longer fit the new pattern
    const isRecurrenceTypeChange = updateData.recurrenceType !== undefined &&
      updateData.recurrenceType !== recurrence.recurrenceType
    const appointmentsToDelete: string[] = []

    if (isRecurrenceTypeChange && recurrence.appointments.length > 0) {
      const newRecurrenceType = updateData.recurrenceType!
      const oldRecurrenceType = recurrence.recurrenceType

      // Sort appointments by date to get the anchor (first future appointment)
      const sortedAppointments = [...recurrence.appointments].sort(
        (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
      )
      const anchorDate = sortedAppointments[0].scheduledAt

      // Calculate which dates should exist under the new recurrence type
      const getIntervalDays = (type: RecurrenceType): number => {
        switch (type) {
          case RecurrenceType.WEEKLY: return 7
          case RecurrenceType.BIWEEKLY: return 14
          case RecurrenceType.MONTHLY: return 0 // Special handling
          default: return 7
        }
      }

      const newIntervalDays = getIntervalDays(newRecurrenceType)

      // Build a set of valid dates under the new recurrence pattern
      const validDates = new Set<string>()

      if (newRecurrenceType === RecurrenceType.MONTHLY) {
        // For MONTHLY, keep appointments on the same day of month
        const anchorDayOfMonth = anchorDate.getDate()
        for (const apt of sortedAppointments) {
          if (apt.scheduledAt.getDate() === anchorDayOfMonth) {
            validDates.add(apt.scheduledAt.toISOString().split("T")[0])
          }
        }
      } else {
        // For WEEKLY/BIWEEKLY, calculate valid dates from anchor
        const anchorTime = anchorDate.getTime()
        const msPerDay = 24 * 60 * 60 * 1000

        // Get the furthest appointment date to know how far to calculate
        const lastApt = sortedAppointments[sortedAppointments.length - 1]
        const maxDate = lastApt.scheduledAt

        let currentDate = new Date(anchorDate)
        while (currentDate <= maxDate) {
          validDates.add(currentDate.toISOString().split("T")[0])
          currentDate = new Date(currentDate.getTime() + newIntervalDays * msPerDay)
        }
      }

      // Find appointments that don't match the new pattern
      for (const apt of sortedAppointments) {
        const aptDateStr = apt.scheduledAt.toISOString().split("T")[0]
        if (!validDates.has(aptDateStr)) {
          appointmentsToDelete.push(apt.id)
        }
      }
    }

    // Apply changes
    const applyToFuture = body.applyTo === "future"
    let updatedAppointmentsCount = 0
    let deletedAppointmentsCount = 0

    await prisma.$transaction(async (tx) => {
      // Update the recurrence record
      await tx.appointmentRecurrence.update({
        where: { id: recurrenceId },
        data: updateData,
      })

      // If recurrence type changed, delete appointments that no longer fit the pattern
      if (isRecurrenceTypeChange && appointmentsToDelete.length > 0) {
        await tx.appointment.deleteMany({
          where: {
            id: { in: appointmentsToDelete },
          },
        })
        deletedAppointmentsCount = appointmentsToDelete.length
      }

      // If day of week changed, bulk update all future appointments with raw SQL
      if (isDayOfWeekChange && dayShiftedAppointments.length > 0) {
        // Build VALUES clause for bulk update
        const values = dayShiftedAppointments.map(apt =>
          `('${apt.id}'::text, '${apt.newScheduledAt.toISOString()}'::timestamptz, '${apt.newEndAt.toISOString()}'::timestamptz)`
        ).join(", ")

        const modalityClause = body.modality
          ? `, "modality" = '${body.modality}'`
          : ""

        await tx.$executeRawUnsafe(`
          UPDATE "Appointment" SET
            "scheduledAt" = v.new_start,
            "endAt" = v.new_end
            ${modalityClause}
          FROM (VALUES ${values}) AS v(id, new_start, new_end)
          WHERE "Appointment".id = v.id
        `)
        updatedAppointmentsCount = dayShiftedAppointments.length
      }

      // If applyTo is "future", update future appointments (for other fields)
      // Skip appointments that were deleted due to recurrence type change
      const remainingAppointments = recurrence.appointments.filter(
        apt => !appointmentsToDelete.includes(apt.id)
      )

      if (applyToFuture && remainingAppointments.length > 0 && !isDayOfWeekChange) {
        const appointmentUpdateData: {
          scheduledAt?: Date
          endAt?: Date
          modality?: AppointmentModality
        } = {}

        // Update modality if provided
        if (body.modality) {
          appointmentUpdateData.modality = body.modality as AppointmentModality
        }

        // Update times if startTime or endTime changed — bulk raw SQL
        if (body.startTime || body.endTime) {
          const newStartTime = body.startTime || recurrence.startTime
          const newEndTime = body.endTime || recurrence.endTime

          const [startHours, startMinutes] = newStartTime.split(":").map(Number)
          const [endHours, endMinutes] = newEndTime.split(":").map(Number)

          const values = remainingAppointments.map(apt => {
            const newScheduledAt = new Date(apt.scheduledAt)
            newScheduledAt.setHours(startHours, startMinutes, 0, 0)
            const newEndAt = new Date(apt.scheduledAt)
            newEndAt.setHours(endHours, endMinutes, 0, 0)
            return `('${apt.id}'::text, '${newScheduledAt.toISOString()}'::timestamptz, '${newEndAt.toISOString()}'::timestamptz)`
          }).join(", ")

          const modalityClause = body.modality
            ? `, "modality" = '${body.modality}'`
            : ""

          await tx.$executeRawUnsafe(`
            UPDATE "Appointment" SET
              "scheduledAt" = v.new_start,
              "endAt" = v.new_end
              ${modalityClause}
            FROM (VALUES ${values}) AS v(id, new_start, new_end)
            WHERE "Appointment".id = v.id
          `)
          updatedAppointmentsCount = remainingAppointments.length
        } else if (body.modality) {
          // Only update modality
          await tx.appointment.updateMany({
            where: {
              id: {
                in: remainingAppointments.map((apt) => apt.id),
              },
            },
            data: {
              modality: body.modality as AppointmentModality,
            },
          })
          updatedAppointmentsCount = remainingAppointments.length
        }
      }

      // Update additional professionals on recurrence + future appointments
      if (hasAdditionalProfChange) {
        const newAdditionalIds = body.additionalProfessionalIds!.filter(
          (id: string) => id !== recurrence.professionalProfileId
        )

        // Delete + recreate RecurrenceProfessional
        await tx.recurrenceProfessional.deleteMany({
          where: { recurrenceId },
        })
        if (newAdditionalIds.length > 0) {
          await tx.recurrenceProfessional.createMany({
            data: newAdditionalIds.map((profId: string) => ({
              recurrenceId,
              professionalProfileId: profId,
            })),
          })
        }

        // Update AppointmentProfessional on all remaining future appointments
        const futureAptIds = remainingAppointments.map(a => a.id)
        if (futureAptIds.length > 0) {
          await tx.appointmentProfessional.deleteMany({
            where: { appointmentId: { in: futureAptIds } },
          })
          if (newAdditionalIds.length > 0) {
            await tx.appointmentProfessional.createMany({
              data: futureAptIds.flatMap(aptId =>
                newAdditionalIds.map((profId: string) => ({
                  appointmentId: aptId,
                  professionalProfileId: profId,
                }))
              ),
            })
          }
        }
      }
    }, { timeout: 30000 })

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
        deletedAppointmentsCount,
      },
      ipAddress,
      userAgent,
    })

    // Build response message
    let message = "Recorrencia atualizada com sucesso"
    if (deletedAppointmentsCount > 0) {
      message = `Recorrencia atualizada. ${deletedAppointmentsCount} agendamento(s) removido(s) para ajustar a nova frequencia.`
    }

    return NextResponse.json({
      success: true,
      message,
      updatedAppointmentsCount,
      deletedAppointmentsCount,
    })
  }
)
