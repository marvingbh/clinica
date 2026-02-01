import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { createAuditLog } from "@/lib/rbac/audit"
import { NotificationChannel, NotificationType, AppointmentStatus } from "@prisma/client"
import { createAndSendNotification } from "@/lib/notifications"

/**
 * POST /api/appointments/:id/cancel
 * Cancel an appointment (professional-initiated)
 *
 * Request body:
 * - reason: string (required) - Cancellation reason
 * - notifyPatient?: boolean - Whether to notify the patient
 * - cancelType?: "single" | "series" - Cancel single occurrence or entire series
 *
 * For recurring appointments:
 * - "single": Only cancels this specific appointment
 * - "series": Cancels all future appointments in the recurrence (past are preserved)
 *
 * - ADMIN can cancel any appointment in the clinic
 * - PROFESSIONAL can only cancel their own appointments
 * - Creates audit log entry
 * - Optionally creates notification record if patient has consent
 */
export const POST = withAuth(
  {
    resource: "appointment",
    action: "update",
    getResourceOwnerId: (_req, params) => params?.id,
  },
  async (req, { user, scope }, params) => {
    // Get request body
    let body: { reason?: string; notifyPatient?: boolean; cancelType?: "single" | "series" }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Requisicao invalida" },
        { status: 400 }
      )
    }

    const { reason, notifyPatient, cancelType = "single" } = body

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Motivo do cancelamento e obrigatorio" },
        { status: 400 }
      )
    }

    if (cancelType !== "single" && cancelType !== "series") {
      return NextResponse.json(
        { error: "Tipo de cancelamento invalido. Use 'single' ou 'series'" },
        { status: 400 }
      )
    }

    // Fetch the appointment with patient data for notification
    const existing = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            consentWhatsApp: true,
            consentEmail: true,
          },
        },
        professionalProfile: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        recurrence: {
          select: {
            id: true,
            recurrenceType: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Agendamento nao encontrado" },
        { status: 404 }
      )
    }

    // Check ownership for "own" scope
    if (scope === "own" && existing.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Voce so pode cancelar seus proprios agendamentos")
    }

    // Validate that the appointment can be cancelled
    const cancellableStatuses: AppointmentStatus[] = [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO]
    if (!cancellableStatuses.includes(existing.status)) {
      return NextResponse.json(
        { error: `Agendamento com status "${existing.status}" nao pode ser cancelado` },
        { status: 400 }
      )
    }

    const cancellationReason = reason.trim()
    const now = new Date()

    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    // Handle series cancellation
    if (cancelType === "series" && existing.recurrenceId) {
      // Find all future appointments in the series that can be cancelled
      const futureAppointments = await prisma.appointment.findMany({
        where: {
          recurrenceId: existing.recurrenceId,
          clinicId: user.clinicId,
          scheduledAt: { gte: now }, // Only future appointments
          status: { in: cancellableStatuses },
        },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              consentWhatsApp: true,
              consentEmail: true,
            },
          },
        },
        orderBy: { scheduledAt: "asc" },
      })

      if (futureAppointments.length === 0) {
        return NextResponse.json(
          { error: "Nao ha agendamentos futuros para cancelar nesta serie" },
          { status: 400 }
        )
      }

      // Cancel all future appointments in a transaction
      const cancelledIds: string[] = []
      await prisma.$transaction(async (tx) => {
        for (const apt of futureAppointments) {
          await tx.appointment.update({
            where: { id: apt.id },
            data: {
              status: "CANCELADO_PROFISSIONAL",
              cancellationReason,
              cancelledAt: now,
            },
          })
          cancelledIds.push(apt.id)
        }

        // Mark the recurrence as inactive
        await tx.appointmentRecurrence.update({
          where: { id: existing.recurrenceId! },
          data: { isActive: false },
        })
      })

      // Create audit log for series cancellation
      await createAuditLog({
        user,
        action: "SERIES_CANCELLATION",
        entityType: "AppointmentRecurrence",
        entityId: existing.recurrenceId,
        oldValues: {
          isActive: true,
          appointmentCount: futureAppointments.length,
        },
        newValues: {
          isActive: false,
          status: "CANCELADO_PROFISSIONAL",
          cancellationReason,
          cancelledAt: now.toISOString(),
          cancelledAppointmentIds: cancelledIds,
        },
        ipAddress,
        userAgent,
      })

      // Send notifications for series cancellation if requested
      let notificationCreated = false
      if (notifyPatient) {
        const patient = existing.patient
        const professionalName = existing.professionalProfile.user.name

        // Format list of cancelled dates
        const cancelledDates = futureAppointments.map((apt) => {
          const scheduledDate = new Date(apt.scheduledAt)
          return scheduledDate.toLocaleDateString("pt-BR", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
          })
        })

        const notificationContent = futureAppointments.length === 1
          ? `Ola ${patient.name}, seu agendamento com ${professionalName} no dia ${cancelledDates[0]} foi cancelado. Motivo: ${cancellationReason}`
          : `Ola ${patient.name}, sua serie de ${futureAppointments.length} agendamentos com ${professionalName} foi cancelada. Sessoes canceladas: ${cancelledDates.slice(0, 5).join(", ")}${cancelledDates.length > 5 ? ` e mais ${cancelledDates.length - 5}` : ""}. Motivo: ${cancellationReason}`

        if (patient.consentWhatsApp && patient.phone) {
          await createAndSendNotification({
            clinicId: user.clinicId,
            patientId: patient.id,
            appointmentId: params.id,
            type: NotificationType.APPOINTMENT_CANCELLATION,
            channel: NotificationChannel.WHATSAPP,
            recipient: patient.phone,
            content: notificationContent,
          })
          notificationCreated = true
        }

        if (patient.consentEmail && patient.email) {
          await createAndSendNotification({
            clinicId: user.clinicId,
            patientId: patient.id,
            appointmentId: params.id,
            type: NotificationType.APPOINTMENT_CANCELLATION,
            channel: NotificationChannel.EMAIL,
            recipient: patient.email,
            subject: "Serie de Agendamentos Cancelada",
            content: notificationContent,
          })
          notificationCreated = true
        }
      }

      return NextResponse.json({
        success: true,
        message: `${futureAppointments.length} agendamento(s) cancelado(s) com sucesso`,
        cancelType: "series",
        cancelledCount: futureAppointments.length,
        cancelledAppointmentIds: cancelledIds,
        notificationCreated,
      })
    }

    // Handle single appointment cancellation (default behavior)
    const updatedAppointment = await prisma.appointment.update({
      where: { id: params.id },
      data: {
        status: "CANCELADO_PROFISSIONAL",
        cancellationReason,
        cancelledAt: now,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
        professionalProfile: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    })

    // Create AuditLog entry
    await createAuditLog({
      user,
      action: "PROFESSIONAL_CANCELLATION",
      entityType: "Appointment",
      entityId: params.id,
      oldValues: {
        status: existing.status,
      },
      newValues: {
        status: "CANCELADO_PROFISSIONAL",
        cancellationReason,
        cancelledAt: now.toISOString(),
      },
      ipAddress,
      userAgent,
    })

    // Create and send notifications if requested and patient has consent
    let notificationCreated = false
    if (notifyPatient) {
      const patient = existing.patient
      const professionalName = existing.professionalProfile.user.name
      const scheduledDate = new Date(existing.scheduledAt)
      const formattedDate = scheduledDate.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      const formattedTime = scheduledDate.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })

      const notificationContent = `Ola ${patient.name}, seu agendamento com ${professionalName} no dia ${formattedDate} as ${formattedTime} foi cancelado. Motivo: ${cancellationReason}`

      // Create and send notification for WhatsApp if consent exists
      if (patient.consentWhatsApp && patient.phone) {
        await createAndSendNotification({
          clinicId: user.clinicId,
          patientId: patient.id,
          appointmentId: params.id,
          type: NotificationType.APPOINTMENT_CANCELLATION,
          channel: NotificationChannel.WHATSAPP,
          recipient: patient.phone,
          content: notificationContent,
        })
        notificationCreated = true
      }

      // Create and send notification for email if consent exists
      if (patient.consentEmail && patient.email) {
        await createAndSendNotification({
          clinicId: user.clinicId,
          patientId: patient.id,
          appointmentId: params.id,
          type: NotificationType.APPOINTMENT_CANCELLATION,
          channel: NotificationChannel.EMAIL,
          recipient: patient.email,
          subject: "Agendamento Cancelado",
          content: notificationContent,
        })
        notificationCreated = true
      }
    }

    return NextResponse.json({
      success: true,
      message: "Agendamento cancelado com sucesso",
      cancelType: "single",
      appointment: {
        id: updatedAppointment.id,
        status: updatedAppointment.status,
        cancellationReason: updatedAppointment.cancellationReason,
        cancelledAt: updatedAppointment.cancelledAt?.toISOString(),
        patientName: updatedAppointment.patient.name,
        professionalName: updatedAppointment.professionalProfile.user.name,
      },
      notificationCreated,
    })
  }
)
