import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { createAuditLog } from "@/lib/rbac/audit"
import { addException, removeException } from "@/lib/appointments/recurrence"
import { AppointmentStatus } from "@/generated/prisma/client"

/**
 * POST /api/appointments/recurrences/:id/exceptions
 * Add or remove an exception date from a recurrence
 *
 * Request body:
 * - date: string (YYYY-MM-DD) - The date to skip or unskip
 * - action: "skip" | "unskip" - Whether to add or remove the exception
 *
 * - ADMIN can modify any recurrence in the clinic
 * - PROFESSIONAL can only modify their own recurrences
 * - When skipping a date, the corresponding appointment is cancelled
 * - When unskipping a date, the appointment is restored if it was cancelled via exception
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

    let body: { date?: string; action?: "skip" | "unskip" }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Requisicao invalida" },
        { status: 400 }
      )
    }

    const { date, action } = body

    if (!date || typeof date !== "string") {
      return NextResponse.json(
        { error: "Data e obrigatoria no formato YYYY-MM-DD" },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: "Data deve estar no formato YYYY-MM-DD" },
        { status: 400 }
      )
    }

    if (action !== "skip" && action !== "unskip") {
      return NextResponse.json(
        { error: "Acao deve ser 'skip' ou 'unskip'" },
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
              gte: new Date(`${date}T00:00:00`),
              lt: new Date(`${date}T23:59:59`),
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

    const currentExceptions = recurrence.exceptions
    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    if (action === "skip") {
      // Check if already an exception
      if (currentExceptions.includes(date)) {
        return NextResponse.json(
          { error: "Esta data ja e uma excecao" },
          { status: 400 }
        )
      }

      // Add the exception and cancel any appointment on that date
      const newExceptions = addException(date, currentExceptions)

      await prisma.$transaction(async (tx) => {
        // Update recurrence with new exception
        await tx.appointmentRecurrence.update({
          where: { id: recurrenceId },
          data: { exceptions: newExceptions },
        })

        // Cancel any appointment on that date (if it exists and is cancellable)
        const cancellableStatuses: AppointmentStatus[] = [
          AppointmentStatus.AGENDADO,
          AppointmentStatus.CONFIRMADO,
        ]

        for (const apt of recurrence.appointments) {
          if (cancellableStatuses.includes(apt.status)) {
            await tx.appointment.update({
              where: { id: apt.id },
              data: {
                status: AppointmentStatus.CANCELADO_PROFISSIONAL,
                cancellationReason: "Excecao na recorrencia - data pulada",
                cancelledAt: new Date(),
              },
            })
          }
        }
      })

      // Create audit log
      await createAuditLog({
        user,
        action: "RECURRENCE_EXCEPTION_ADDED",
        entityType: "AppointmentRecurrence",
        entityId: recurrenceId,
        oldValues: { exceptions: currentExceptions },
        newValues: { exceptions: newExceptions, skippedDate: date },
        ipAddress,
        userAgent,
      })

      return NextResponse.json({
        success: true,
        message: `Data ${date} pulada com sucesso`,
        exceptions: newExceptions,
        cancelledAppointments: recurrence.appointments.length,
      })
    } else {
      // action === "unskip"
      // Check if it's actually an exception
      if (!currentExceptions.includes(date)) {
        return NextResponse.json(
          { error: "Esta data nao e uma excecao" },
          { status: 400 }
        )
      }

      const newExceptions = removeException(date, currentExceptions)

      // Update recurrence and potentially restore the appointment
      const result = await prisma.$transaction(async (tx) => {
        // Update recurrence
        await tx.appointmentRecurrence.update({
          where: { id: recurrenceId },
          data: { exceptions: newExceptions },
        })

        // Check if there's a cancelled appointment to restore
        let restoredAppointment = null
        for (const apt of recurrence.appointments) {
          if (
            apt.status === AppointmentStatus.CANCELADO_PROFISSIONAL &&
            apt.cancellationReason === "Excecao na recorrencia - data pulada"
          ) {
            restoredAppointment = await tx.appointment.update({
              where: { id: apt.id },
              data: {
                status: AppointmentStatus.AGENDADO,
                cancellationReason: null,
                cancelledAt: null,
              },
            })
          }
        }

        return { restoredAppointment }
      })

      // Create audit log
      await createAuditLog({
        user,
        action: "RECURRENCE_EXCEPTION_REMOVED",
        entityType: "AppointmentRecurrence",
        entityId: recurrenceId,
        oldValues: { exceptions: currentExceptions },
        newValues: { exceptions: newExceptions, restoredDate: date },
        ipAddress,
        userAgent,
      })

      return NextResponse.json({
        success: true,
        message: `Data ${date} restaurada com sucesso`,
        exceptions: newExceptions,
        appointmentRestored: !!result.restoredAppointment,
      })
    }
  }
)

/**
 * GET /api/appointments/recurrences/:id/exceptions
 * Get all exceptions for a recurrence
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
      select: {
        id: true,
        exceptions: true,
        professionalProfileId: true,
        isActive: true,
        recurrenceType: true,
        recurrenceEndType: true,
        startDate: true,
        endDate: true,
        occurrences: true,
        startTime: true,
        duration: true,
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
      recurrenceId: recurrence.id,
      exceptions: recurrence.exceptions,
      isActive: recurrence.isActive,
    })
  }
)
