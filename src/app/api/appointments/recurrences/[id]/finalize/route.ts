import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { createAuditLog } from "@/lib/rbac/audit"
import { RecurrenceEndType } from "@prisma/client"
import { z } from "zod"

const finalizeRecurrenceSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
})

/**
 * POST /api/appointments/recurrences/:id/finalize
 * Finalize an indefinite recurrence by setting an end date
 *
 * Request body:
 * - endDate: string (YYYY-MM-DD) - The date to end the recurrence
 * - cancelFutureAppointments: boolean (optional) - Whether to cancel appointments after endDate
 *
 * This endpoint:
 * - Changes recurrenceEndType from INDEFINITE to BY_DATE
 * - Sets the endDate
 * - Optionally cancels appointments after the end date
 * - Keeps all existing appointments before/on the end date
 */
export const POST = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")
    const url = new URL(req.url)
    const pathParts = url.pathname.split("/")
    const recurrenceId = pathParts[pathParts.indexOf("recurrences") + 1]

    let body: z.infer<typeof finalizeRecurrenceSchema>
    try {
      const rawBody = await req.json()
      const validation = finalizeRecurrenceSchema.safeParse(rawBody)
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

    const { endDate } = body

    // Parse end date as local time by appending time component
    const endDateTime = new Date(endDate + "T23:59:59.999")

    // Validate end date is not in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDateOnly = new Date(endDate + "T00:00:00")

    if (endDateOnly < today) {
      return NextResponse.json(
        { error: "Data de fim nao pode ser no passado" },
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
              gt: endDateTime,
            },
            status: {
              notIn: ["FINALIZADO"],
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

    // Only allow finalizing INDEFINITE recurrences
    if (recurrence.recurrenceEndType !== RecurrenceEndType.INDEFINITE) {
      return NextResponse.json(
        { error: "Apenas recorrencias indefinidas podem ser finalizadas" },
        { status: 400 }
      )
    }

    const oldValues = {
      recurrenceEndType: recurrence.recurrenceEndType,
      endDate: recurrence.endDate,
      lastGeneratedDate: recurrence.lastGeneratedDate,
    }

    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    const deletedAppointmentsCount = recurrence.appointments.length

    await prisma.$transaction(async (tx) => {
      // Update the recurrence to BY_DATE with the end date
      await tx.appointmentRecurrence.update({
        where: { id: recurrenceId },
        data: {
          recurrenceEndType: RecurrenceEndType.BY_DATE,
          endDate: endDateTime,
          lastGeneratedDate: null, // Clear since no longer INDEFINITE
        },
      })

      // Permanently delete future appointments after the end date
      // (notifications get appointmentId set to null)
      if (recurrence.appointments.length > 0) {
        await tx.appointment.deleteMany({
          where: {
            id: {
              in: recurrence.appointments.map((apt) => apt.id),
            },
          },
        })
      }
    })

    // Create audit log
    await createAuditLog({
      user,
      action: "RECURRENCE_FINALIZED",
      entityType: "AppointmentRecurrence",
      entityId: recurrenceId,
      oldValues,
      newValues: {
        recurrenceEndType: RecurrenceEndType.BY_DATE,
        endDate,
        deletedAppointmentsCount,
      },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      message: `Recorrencia finalizada com sucesso${deletedAppointmentsCount > 0 ? `. ${deletedAppointmentsCount} agendamento(s) removido(s).` : ""}`,
      endDate,
      deletedAppointmentsCount,
    })
  }
)
