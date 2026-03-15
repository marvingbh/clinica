import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { createAuditLog } from "@/lib/rbac/audit"
import { RecurrenceType, RecurrenceEndType, AppointmentStatus, AppointmentModality, AppointmentType } from "@prisma/client"
import { z } from "zod"
import {
  prepareDayShift,
  prepareBiweeklySwap,
  computeRecurrenceTypeChanges,
  checkRecurrenceTypeConflicts,
} from "./recurrence-patch-helpers"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateRecurrenceSchema = z.object({
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  endTime: z.string().regex(timeRegex, "Invalid time format (HH:mm)").optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).optional().nullable(),
  recurrenceEndType: z.enum(["BY_DATE", "BY_OCCURRENCES", "INDEFINITE"]).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  occurrences: z.number().int().min(1).max(52).optional().nullable(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  applyTo: z.enum(["future"]).optional(),
  additionalProfessionalIds: z.array(z.string()).optional(),
  swapBiweeklyWeek: z.boolean().optional(),
  swapScope: z.enum(["future", "all"]).optional(),
})

/**
 * GET /api/appointments/recurrences/:id
 */
export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "READ")
    const url = new URL(req.url)
    const pathParts = url.pathname.split("/")
    const recurrenceId = pathParts[pathParts.indexOf("recurrences") + 1]

    const recurrence = await prisma.appointmentRecurrence.findFirst({
      where: { id: recurrenceId, clinicId: user.clinicId },
      include: {
        patient: { select: { id: true, name: true, phone: true, email: true } },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        appointments: {
          where: { scheduledAt: { gte: new Date() }, status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO] } },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, scheduledAt: true, endAt: true, status: true, modality: true },
        },
      },
    })

    if (!recurrence) {
      return NextResponse.json({ error: "Recorrencia nao encontrada" }, { status: 404 })
    }
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
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")
    const url = new URL(req.url)
    const pathParts = url.pathname.split("/")
    const recurrenceId = pathParts[pathParts.indexOf("recurrences") + 1]

    // --- Validate request body ---
    let body: z.infer<typeof updateRecurrenceSchema>
    try {
      const rawBody = await req.json()
      const validation = updateRecurrenceSchema.safeParse(rawBody)
      if (!validation.success) {
        return NextResponse.json({ error: "Dados invalidos", details: validation.error.flatten() }, { status: 400 })
      }
      body = validation.data
    } catch {
      return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
    }

    // --- Fetch recurrence ---
    const recurrence = await prisma.appointmentRecurrence.findFirst({
      where: { id: recurrenceId, clinicId: user.clinicId },
      include: {
        appointments: {
          where: { scheduledAt: { gte: new Date() }, status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO] } },
        },
        additionalProfessionals: { select: { professionalProfileId: true } },
      },
    })

    if (!recurrence) return NextResponse.json({ error: "Recorrencia nao encontrada" }, { status: 404 })
    if (!canSeeOthers && recurrence.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Voce so pode modificar suas proprias recorrencias")
    }
    if (!recurrence.isActive) return NextResponse.json({ error: "Recorrencia esta inativa" }, { status: 400 })

    // --- Validate end type consistency ---
    if (body.recurrenceEndType === "BY_DATE" && !body.endDate && !recurrence.endDate) {
      return NextResponse.json({ error: "Data final e obrigatoria para tipo BY_DATE" }, { status: 400 })
    }
    if (body.recurrenceEndType === "BY_OCCURRENCES" && !body.occurrences && !recurrence.occurrences) {
      return NextResponse.json({ error: "Numero de ocorrencias e obrigatorio para tipo BY_OCCURRENCES" }, { status: 400 })
    }

    // --- Build update data ---
    const oldValues = {
      recurrenceType: recurrence.recurrenceType, startTime: recurrence.startTime,
      endTime: recurrence.endTime, modality: recurrence.modality,
      recurrenceEndType: recurrence.recurrenceEndType, endDate: recurrence.endDate,
      occurrences: recurrence.occurrences, dayOfWeek: recurrence.dayOfWeek,
    }

    const updateData: Record<string, unknown> = {}
    if (body.recurrenceType) updateData.recurrenceType = body.recurrenceType
    if (body.startTime) updateData.startTime = body.startTime
    if (body.endTime) updateData.endTime = body.endTime
    if (body.modality) updateData.modality = body.modality
    if (body.recurrenceEndType) {
      updateData.recurrenceEndType = body.recurrenceEndType
      if (body.recurrenceEndType !== "INDEFINITE" && recurrence.recurrenceEndType === RecurrenceEndType.INDEFINITE) {
        updateData.lastGeneratedDate = null
      }
    }
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null
    if (body.occurrences !== undefined) updateData.occurrences = body.occurrences
    if (body.dayOfWeek !== undefined && body.dayOfWeek !== recurrence.dayOfWeek) updateData.dayOfWeek = body.dayOfWeek

    const hasAdditionalProfChange = body.additionalProfessionalIds !== undefined
    const isSwapBiweeklyWeek = body.swapBiweeklyWeek === true
    if (Object.keys(updateData).length === 0 && !hasAdditionalProfChange && !isSwapBiweeklyWeek) {
      return NextResponse.json({ error: "Nenhuma alteracao fornecida" }, { status: 400 })
    }

    const effectiveAdditionalProfIds = body.additionalProfessionalIds
      ?? recurrence.additionalProfessionals.map(ap => ap.professionalProfileId)

    // --- Prepare day-of-week shift ---
    const isDayOfWeekChange = updateData.dayOfWeek !== undefined
    let dayShiftedAppointments: Array<{ id: string; oldScheduledAt: Date; oldEndAt: Date; newScheduledAt: Date; newEndAt: Date }> = []

    if (isDayOfWeekChange && recurrence.appointments.length > 0) {
      const result = await prepareDayShift({
        appointments: recurrence.appointments,
        newDayOfWeek: updateData.dayOfWeek as number,
        newStartTime: body.startTime,
        newEndTime: body.endTime,
        currentStartTime: recurrence.startTime,
        currentEndTime: recurrence.endTime,
        professionalProfileId: recurrence.professionalProfileId,
        additionalProfessionalIds: effectiveAdditionalProfIds,
      })
      if ("conflicts" in result) {
        return NextResponse.json({ error: "Conflitos de horario encontrados ao mudar o dia da semana", code: "DAY_CHANGE_CONFLICTS", conflicts: result.conflicts }, { status: 409 })
      }
      dayShiftedAppointments = result.shifted
    }

    // --- Prepare biweekly swap ---
    let swapShiftedAppointments: Array<{ id: string; newScheduledAt: Date; newEndAt: Date }> = []

    if (isSwapBiweeklyWeek) {
      if (recurrence.recurrenceType !== RecurrenceType.BIWEEKLY) {
        return NextResponse.json({ error: "Trocar semana so e possivel para recorrencias quinzenais" }, { status: 400 })
      }
      const swapScope = body.swapScope || "future"
      const appointmentsToSwap = swapScope === "all"
        ? await prisma.appointment.findMany({
            where: { recurrenceId, status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO, AppointmentStatus.FINALIZADO] } },
            select: { id: true, scheduledAt: true, endAt: true },
          })
        : recurrence.appointments
      if (appointmentsToSwap.length === 0) {
        return NextResponse.json({ error: "Nenhum agendamento encontrado para trocar" }, { status: 400 })
      }
      const result = await prepareBiweeklySwap({
        appointments: appointmentsToSwap,
        professionalProfileId: recurrence.professionalProfileId,
        additionalProfessionalIds: effectiveAdditionalProfIds,
      })
      if ("conflicts" in result) {
        return NextResponse.json({ error: "Conflitos de horario encontrados ao trocar a semana quinzenal", code: "BIWEEKLY_SWAP_CONFLICTS", conflicts: result.conflicts }, { status: 409 })
      }
      swapShiftedAppointments = result.shifted
    }

    // --- Prepare recurrence type change ---
    const isRecurrenceTypeChange = updateData.recurrenceType !== undefined && updateData.recurrenceType !== recurrence.recurrenceType
    let appointmentsToDelete: string[] = []
    let appointmentsToCreate: Array<{ scheduledAt: Date; endAt: Date }> = []

    if (isRecurrenceTypeChange && recurrence.appointments.length > 0) {
      const changes = computeRecurrenceTypeChanges({
        appointments: recurrence.appointments,
        newRecurrenceType: updateData.recurrenceType as RecurrenceType,
      })
      appointmentsToDelete = changes.toDelete
      appointmentsToCreate = changes.toCreate

      const conflicts = await checkRecurrenceTypeConflicts({
        appointmentsToCreate,
        recurrenceId,
        professionalProfileId: recurrence.professionalProfileId,
        additionalProfessionalIds: effectiveAdditionalProfIds,
      })
      if (conflicts) {
        return NextResponse.json({ error: "Conflitos de horario encontrados ao mudar a frequencia", code: "RECURRENCE_TYPE_CHANGE_CONFLICTS", conflicts }, { status: 409 })
      }
    }

    // --- Apply all changes in transaction ---
    const applyToFuture = body.applyTo === "future"
    let updatedAppointmentsCount = 0
    let deletedAppointmentsCount = 0
    let createdAppointmentsCount = 0

    await prisma.$transaction(async (tx) => {
      // Update recurrence record
      await tx.appointmentRecurrence.update({ where: { id: recurrenceId }, data: updateData })

      // Delete appointments for recurrence type change
      if (isRecurrenceTypeChange && appointmentsToDelete.length > 0) {
        await tx.appointment.deleteMany({ where: { id: { in: appointmentsToDelete } } })
        deletedAppointmentsCount = appointmentsToDelete.length
      }

      // Create appointments for recurrence type change
      if (isRecurrenceTypeChange && appointmentsToCreate.length > 0) {
        const blockingTypes: AppointmentType[] = [AppointmentType.CONSULTA, AppointmentType.TAREFA, AppointmentType.REUNIAO]
        await tx.appointment.createMany({
          data: appointmentsToCreate.map(apt => ({
            clinicId: recurrence.clinicId,
            professionalProfileId: recurrence.professionalProfileId,
            patientId: recurrence.patientId,
            recurrenceId,
            type: recurrence.type,
            title: recurrence.title,
            blocksTime: blockingTypes.includes(recurrence.type),
            scheduledAt: apt.scheduledAt,
            endAt: apt.endAt,
            modality: body.modality as AppointmentModality ?? recurrence.modality,
            status: AppointmentStatus.AGENDADO,
          })),
        })

        // Create additional professional records for new appointments
        if (effectiveAdditionalProfIds.length > 0) {
          const newApts = await tx.appointment.findMany({
            where: { recurrenceId, scheduledAt: { in: appointmentsToCreate.map(a => a.scheduledAt) } },
            select: { id: true },
          })
          if (newApts.length > 0) {
            await tx.appointmentProfessional.createMany({
              data: newApts.flatMap(apt => effectiveAdditionalProfIds.map(profId => ({ appointmentId: apt.id, professionalProfileId: profId }))),
            })
          }
        }
        createdAppointmentsCount = appointmentsToCreate.length
      }

      // Bulk update for day-of-week shift
      if (isDayOfWeekChange && dayShiftedAppointments.length > 0) {
        const values = dayShiftedAppointments.map(apt =>
          `('${apt.id}'::text, '${apt.newScheduledAt.toISOString()}'::timestamptz, '${apt.newEndAt.toISOString()}'::timestamptz)`
        ).join(", ")
        const modalityClause = body.modality ? `, "modality" = '${body.modality}'` : ""
        await tx.$executeRawUnsafe(`UPDATE "Appointment" SET "scheduledAt" = v.new_start, "endAt" = v.new_end ${modalityClause} FROM (VALUES ${values}) AS v(id, new_start, new_end) WHERE "Appointment".id = v.id`)
        updatedAppointmentsCount = dayShiftedAppointments.length
      }

      // Bulk update for biweekly swap
      if (isSwapBiweeklyWeek && swapShiftedAppointments.length > 0) {
        const values = swapShiftedAppointments.map(apt =>
          `('${apt.id}'::text, '${apt.newScheduledAt.toISOString()}'::timestamptz, '${apt.newEndAt.toISOString()}'::timestamptz)`
        ).join(", ")
        await tx.$executeRawUnsafe(`UPDATE "Appointment" SET "scheduledAt" = v.new_start, "endAt" = v.new_end FROM (VALUES ${values}) AS v(id, new_start, new_end) WHERE "Appointment".id = v.id`)
        const newStartDate = new Date(recurrence.startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        await tx.appointmentRecurrence.update({ where: { id: recurrenceId }, data: { startDate: newStartDate } })
        updatedAppointmentsCount = swapShiftedAppointments.length
      }

      // Apply time/modality changes to future appointments (non-day-change)
      const remainingAppointments = recurrence.appointments.filter(apt => !appointmentsToDelete.includes(apt.id))

      if (applyToFuture && remainingAppointments.length > 0 && !isDayOfWeekChange) {
        if (body.startTime || body.endTime) {
          const newStartTime = body.startTime || recurrence.startTime
          const newEndTime = body.endTime || recurrence.endTime
          const [sh, sm] = newStartTime.split(":").map(Number)
          const [eh, em] = newEndTime.split(":").map(Number)
          const values = remainingAppointments.map(apt => {
            const ns = new Date(apt.scheduledAt); ns.setHours(sh, sm, 0, 0)
            const ne = new Date(apt.scheduledAt); ne.setHours(eh, em, 0, 0)
            return `('${apt.id}'::text, '${ns.toISOString()}'::timestamptz, '${ne.toISOString()}'::timestamptz)`
          }).join(", ")
          const modalityClause = body.modality ? `, "modality" = '${body.modality}'` : ""
          await tx.$executeRawUnsafe(`UPDATE "Appointment" SET "scheduledAt" = v.new_start, "endAt" = v.new_end ${modalityClause} FROM (VALUES ${values}) AS v(id, new_start, new_end) WHERE "Appointment".id = v.id`)
          updatedAppointmentsCount = remainingAppointments.length
        } else if (body.modality) {
          await tx.appointment.updateMany({ where: { id: { in: remainingAppointments.map(a => a.id) } }, data: { modality: body.modality as AppointmentModality } })
          updatedAppointmentsCount = remainingAppointments.length
        }
      }

      // Update additional professionals
      if (hasAdditionalProfChange) {
        const newIds = body.additionalProfessionalIds!.filter((id: string) => id !== recurrence.professionalProfileId)
        await tx.recurrenceProfessional.deleteMany({ where: { recurrenceId } })
        if (newIds.length > 0) {
          await tx.recurrenceProfessional.createMany({ data: newIds.map((profId: string) => ({ recurrenceId, professionalProfileId: profId })) })
        }
        const futureAptIds = remainingAppointments.map(a => a.id)
        if (futureAptIds.length > 0) {
          await tx.appointmentProfessional.deleteMany({ where: { appointmentId: { in: futureAptIds } } })
          if (newIds.length > 0) {
            await tx.appointmentProfessional.createMany({
              data: futureAptIds.flatMap(aptId => newIds.map((profId: string) => ({ appointmentId: aptId, professionalProfileId: profId }))),
            })
          }
        }
      }
    }, { timeout: 30000 })

    // --- Audit log ---
    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined
    await createAuditLog({
      user, action: "RECURRENCE_UPDATED", entityType: "AppointmentRecurrence", entityId: recurrenceId,
      oldValues, newValues: { ...updateData, applyTo: body.applyTo, swapBiweeklyWeek: body.swapBiweeklyWeek, swapScope: body.swapScope, updatedAppointmentsCount, deletedAppointmentsCount, createdAppointmentsCount },
      ipAddress, userAgent,
    })

    let message = "Recorrencia atualizada com sucesso"
    if (isSwapBiweeklyWeek) {
      message = `Semana quinzenal trocada com sucesso. ${updatedAppointmentsCount} agendamento(s) atualizado(s).`
    } else if (deletedAppointmentsCount > 0 || createdAppointmentsCount > 0) {
      const parts: string[] = []
      if (deletedAppointmentsCount > 0) parts.push(`${deletedAppointmentsCount} removido(s)`)
      if (createdAppointmentsCount > 0) parts.push(`${createdAppointmentsCount} criado(s)`)
      message = `Recorrencia atualizada. ${parts.join(" e ")} para ajustar a nova frequencia.`
    }

    return NextResponse.json({ success: true, message, updatedAppointmentsCount, deletedAppointmentsCount, createdAppointmentsCount })
  }
)
