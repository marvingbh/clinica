import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { createAuditLog } from "@/lib/rbac/audit"
import { RecurrenceType, RecurrenceEndType, AppointmentStatus, AppointmentModality, AppointmentType } from "@prisma/client"
import { z } from "zod"
import { calculateDayShiftedDates, calculateBiweeklySwapDates } from "@/lib/appointments/recurrence"
import { checkConflictsBulk } from "@/lib/appointments/conflict-check"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateRecurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  endTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).optional().nullable(),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES", "INDEFINITE"]).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  occurrences: z.number().int().min(1).max(52).optional().nullable(),
  dayOfWeek: z.number().int().min(0).max(6).optional(), // 0 = Sunday, 6 = Saturday
  applyTo: z.enum(["future"]).optional(), // Only "future" is supported for now
  additionalProfessionalIds: z.array(z.string()).optional(),
  swapBiweeklyWeek: z.boolean().optional(),
  swapScope: z.enum(["future", "all"]).optional(),
})

/**
 * GET /api/appointments/recurrences/:id
 * Get recurrence details with future appointments
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
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

    // Check ownership if user cannot see others' appointments
    if (!canSeeOthers && recurrence.professionalProfileId !== user.professionalProfileId) {
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
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")
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

    // Check ownership if user cannot manage others' appointments
    if (!canSeeOthers && recurrence.professionalProfileId !== user.professionalProfileId) {
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
    const isSwapBiweeklyWeek = body.swapBiweeklyWeek === true
    if (Object.keys(updateData).length === 0 && !hasAdditionalProfChange && !isSwapBiweeklyWeek) {
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

    // Handle biweekly week swap
    const swapShiftedAppointments: Array<{
      id: string
      newScheduledAt: Date
      newEndAt: Date
    }> = []

    if (isSwapBiweeklyWeek) {
      if (recurrence.recurrenceType !== RecurrenceType.BIWEEKLY) {
        return NextResponse.json(
          { error: "Trocar semana so e possivel para recorrencias quinzenais" },
          { status: 400 }
        )
      }

      // Get appointments based on scope
      const swapScope = body.swapScope || "future"
      const appointmentsToSwap = swapScope === "all"
        ? await prisma.appointment.findMany({
            where: {
              recurrenceId: recurrenceId,
              status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO, AppointmentStatus.FINALIZADO] },
            },
            select: { id: true, scheduledAt: true, endAt: true },
          })
        : recurrence.appointments // already fetched (future only, AGENDADO/CONFIRMADO)

      if (appointmentsToSwap.length === 0) {
        return NextResponse.json(
          { error: "Nenhum agendamento encontrado para trocar" },
          { status: 400 }
        )
      }

      // Calculate new dates
      const swappedDates = calculateBiweeklySwapDates(appointmentsToSwap)

      // Bulk conflict check (exclude the appointments being moved)
      const effectiveAdditionalProfIds = body.additionalProfessionalIds
        ?? recurrence.additionalProfessionals.map(ap => ap.professionalProfileId)
      const bulkResult = await checkConflictsBulk({
        professionalProfileId: recurrence.professionalProfileId,
        dates: swappedDates.map(d => ({ scheduledAt: d.newScheduledAt, endAt: d.newEndAt })),
        excludeAppointmentIds: appointmentsToSwap.map(a => a.id),
        additionalProfessionalIds: effectiveAdditionalProfIds,
      })

      if (bulkResult.conflicts.length > 0) {
        const conflicts = bulkResult.conflicts.map(c => ({
          date: swappedDates[c.index].newScheduledAt.toLocaleDateString("pt-BR"),
          conflictsWith: c.conflictingAppointment.patientName || c.conflictingAppointment.title || "outro compromisso",
        }))

        return NextResponse.json(
          {
            error: "Conflitos de horario encontrados ao trocar a semana quinzenal",
            code: "BIWEEKLY_SWAP_CONFLICTS",
            conflicts,
          },
          { status: 409 }
        )
      }

      // No conflicts — populate swap shifted appointments
      for (const swapped of swappedDates) {
        swapShiftedAppointments.push({
          id: swapped.id,
          newScheduledAt: swapped.newScheduledAt,
          newEndAt: swapped.newEndAt,
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

    // When changing recurrence type (e.g. BIWEEKLY → WEEKLY), create missing appointments
    // Uses actual appointment dates as anchor (not startDate which may have drifted)
    const appointmentsToCreate: Array<{ scheduledAt: Date; endAt: Date }> = []

    if (isRecurrenceTypeChange && recurrence.appointments.length > 0) {
      const newRecurrenceType = updateData.recurrenceType!

      const sortedAppointments = [...recurrence.appointments].sort(
        (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
      )
      const anchorApt = sortedAppointments[0]
      const lastApt = sortedAppointments[sortedAppointments.length - 1]

      const getIntervalDaysForType = (type: RecurrenceType): number => {
        switch (type) {
          case RecurrenceType.WEEKLY: return 7
          case RecurrenceType.BIWEEKLY: return 14
          default: return 7
        }
      }

      // Calculate expected dates from the anchor appointment under the new interval
      // (same approach the deletion code above uses)
      if (newRecurrenceType !== RecurrenceType.MONTHLY) {
        const newIntervalDays = getIntervalDaysForType(newRecurrenceType)
        const msPerDay = 24 * 60 * 60 * 1000
        const anchorTime = anchorApt.scheduledAt.getTime()
        const maxTime = lastApt.scheduledAt.getTime()
        const duration = anchorApt.endAt.getTime() - anchorApt.scheduledAt.getTime()

        // Build set of existing appointment dates (excluding ones being deleted)
        const keptAppointmentDates = new Set(
          recurrence.appointments
            .filter(apt => !appointmentsToDelete.includes(apt.id))
            .map(apt => apt.scheduledAt.toISOString().split("T")[0])
        )

        const now = new Date()
        let currentTime = anchorTime
        while (currentTime <= maxTime) {
          const candidateDate = new Date(currentTime)
          const dateStr = candidateDate.toISOString().split("T")[0]
          if (candidateDate > now && !keptAppointmentDates.has(dateStr)) {
            appointmentsToCreate.push({
              scheduledAt: candidateDate,
              endAt: new Date(currentTime + duration),
            })
          }
          currentTime += newIntervalDays * msPerDay
        }
      }

      // Conflict check — excludes appointments from the same recurrence (no self-conflict)
      if (appointmentsToCreate.length > 0) {
        const effectiveAdditionalProfIds = body.additionalProfessionalIds
          ?? recurrence.additionalProfessionals.map(ap => ap.professionalProfileId)
        const bulkResult = await checkConflictsBulk({
          professionalProfileId: recurrence.professionalProfileId,
          dates: appointmentsToCreate,
          excludeRecurrenceId: recurrenceId,
          additionalProfessionalIds: effectiveAdditionalProfIds,
        })

        if (bulkResult.conflicts.length > 0) {
          const conflicts = bulkResult.conflicts.map(c => ({
            date: appointmentsToCreate[c.index].scheduledAt.toLocaleDateString("pt-BR"),
            conflictsWith: c.conflictingAppointment.patientName || c.conflictingAppointment.title || "outro compromisso",
          }))

          return NextResponse.json(
            {
              error: "Conflitos de horario encontrados ao mudar a frequencia",
              code: "RECURRENCE_TYPE_CHANGE_CONFLICTS",
              conflicts,
            },
            { status: 409 }
          )
        }
      }
    }

    // Apply changes
    const applyToFuture = body.applyTo === "future"
    let updatedAppointmentsCount = 0
    let deletedAppointmentsCount = 0
    let createdAppointmentsCount = 0

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

      // If recurrence type changed, create missing appointments for the new pattern
      if (isRecurrenceTypeChange && appointmentsToCreate.length > 0) {
        const blockingTypes: AppointmentType[] = [AppointmentType.CONSULTA, AppointmentType.TAREFA, AppointmentType.REUNIAO]
        const blocksTime = blockingTypes.includes(recurrence.type)

        await tx.appointment.createMany({
          data: appointmentsToCreate.map(apt => ({
            clinicId: recurrence.clinicId,
            professionalProfileId: recurrence.professionalProfileId,
            patientId: recurrence.patientId,
            recurrenceId: recurrenceId,
            type: recurrence.type,
            title: recurrence.title,
            blocksTime,
            scheduledAt: apt.scheduledAt,
            endAt: apt.endAt,
            modality: body.modality as AppointmentModality ?? recurrence.modality,
            status: AppointmentStatus.AGENDADO,
          })),
        })

        // Create AppointmentProfessional records for additional professionals
        const effectiveAdditionalProfIds = body.additionalProfessionalIds
          ?? recurrence.additionalProfessionals.map(ap => ap.professionalProfileId)
        if (effectiveAdditionalProfIds.length > 0) {
          // Fetch newly created appointment IDs by matching recurrence + dates
          const newAptDates = appointmentsToCreate.map(a => a.scheduledAt)
          const newApts = await tx.appointment.findMany({
            where: {
              recurrenceId: recurrenceId,
              scheduledAt: { in: newAptDates },
            },
            select: { id: true },
          })
          if (newApts.length > 0) {
            await tx.appointmentProfessional.createMany({
              data: newApts.flatMap(apt =>
                effectiveAdditionalProfIds.map(profId => ({
                  appointmentId: apt.id,
                  professionalProfileId: profId,
                }))
              ),
            })
          }
        }

        createdAppointmentsCount = appointmentsToCreate.length
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

      // If biweekly week swap, bulk update appointments + shift startDate
      if (isSwapBiweeklyWeek && swapShiftedAppointments.length > 0) {
        const values = swapShiftedAppointments.map(apt =>
          `('${apt.id}'::text, '${apt.newScheduledAt.toISOString()}'::timestamptz, '${apt.newEndAt.toISOString()}'::timestamptz)`
        ).join(", ")

        await tx.$executeRawUnsafe(`
          UPDATE "Appointment" SET
            "scheduledAt" = v.new_start,
            "endAt" = v.new_end
          FROM (VALUES ${values}) AS v(id, new_start, new_end)
          WHERE "Appointment".id = v.id
        `)

        // Shift startDate by +7 days
        const currentStartDate = recurrence.startDate
        const newStartDate = new Date(currentStartDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        await tx.appointmentRecurrence.update({
          where: { id: recurrenceId },
          data: { startDate: newStartDate },
        })

        updatedAppointmentsCount = swapShiftedAppointments.length
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
        swapBiweeklyWeek: body.swapBiweeklyWeek,
        swapScope: body.swapScope,
        updatedAppointmentsCount,
        deletedAppointmentsCount,
        createdAppointmentsCount,
      },
      ipAddress,
      userAgent,
    })

    // Build response message
    let message = "Recorrencia atualizada com sucesso"
    if (isSwapBiweeklyWeek) {
      message = `Semana quinzenal trocada com sucesso. ${updatedAppointmentsCount} agendamento(s) atualizado(s).`
    } else if (deletedAppointmentsCount > 0 || createdAppointmentsCount > 0) {
      const parts: string[] = []
      if (deletedAppointmentsCount > 0) parts.push(`${deletedAppointmentsCount} removido(s)`)
      if (createdAppointmentsCount > 0) parts.push(`${createdAppointmentsCount} criado(s)`)
      message = `Recorrencia atualizada. ${parts.join(" e ")} para ajustar a nova frequencia.`
    }

    return NextResponse.json({
      success: true,
      message,
      updatedAppointmentsCount,
      deletedAppointmentsCount,
      createdAppointmentsCount,
    })
  }
)
