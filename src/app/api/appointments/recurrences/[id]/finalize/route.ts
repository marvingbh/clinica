import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { createAuditLog } from "@/lib/rbac/audit"
import { RecurrenceEndType, AppointmentStatus } from "@/generated/prisma/client"
import { z } from "zod"

const finalizeRecurrenceSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  cancelFutureAppointments: z.boolean().optional().default(false),
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
export const POST = withAuth(
  {
    resource: "appointment",
    action: "update",
  },
  async (req, { user, scope }) => {
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

    const { endDate, cancelFutureAppointments } = body

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

    let cancelledAppointmentsCount = 0

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

      // Optionally cancel appointments after the end date
      if (cancelFutureAppointments && recurrence.appointments.length > 0) {
        await tx.appointment.updateMany({
          where: {
            id: {
              in: recurrence.appointments.map((apt) => apt.id),
            },
          },
          data: {
            status: AppointmentStatus.CANCELADO_PROFISSIONAL,
            cancellationReason: "Recorrencia finalizada",
            cancelledAt: new Date(),
          },
        })
        cancelledAppointmentsCount = recurrence.appointments.length
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
        cancelledAppointmentsCount,
      },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      message: `Recorrencia finalizada com sucesso${cancelledAppointmentsCount > 0 ? `. ${cancelledAppointmentsCount} agendamento(s) cancelado(s).` : ""}`,
      endDate,
      cancelledAppointmentsCount,
      appointmentsAfterEndDate: recurrence.appointments.length,
    })
  }
)
