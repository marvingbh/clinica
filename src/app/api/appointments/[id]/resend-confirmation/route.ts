import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { regenerateAppointmentTokens, buildConfirmLink, buildCancelLink } from "@/lib/appointments"
import { createAndSendNotification } from "@/lib/notifications"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { audit, AuditAction } from "@/lib/rbac"

// Cooldown period in milliseconds (1 hour)
const RESEND_COOLDOWN_MS = 60 * 60 * 1000

/**
 * POST /api/appointments/:id/resend-confirmation
 * Resend confirmation link to patient
 *
 * - Generates new tokens (invalidates old ones)
 * - Triggers notification send (WhatsApp/email based on consent)
 * - Cooldown period: cannot resend within 1 hour
 * - Creates AuditLog entry for resend action
 *
 * - ADMIN can resend for any appointment in the clinic
 * - PROFESSIONAL can only resend for their own appointments
 */
export const POST = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")
    // Fetch the appointment with patient data and tokens
    const appointment = await prisma.appointment.findFirst({
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
        notifications: {
          where: {
            type: NotificationType.APPOINTMENT_CONFIRMATION,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    })

    if (!appointment) {
      return NextResponse.json(
        { error: "Agendamento nao encontrado" },
        { status: 404 }
      )
    }

    // Check ownership if user cannot manage others' appointments
    if (!canSeeOthers && appointment.professionalProfileId !== user.professionalProfileId) {
      return forbiddenResponse("Voce so pode reenviar confirmacao de seus proprios agendamentos")
    }

    // Validate that the appointment can have confirmation resent
    const resendableStatuses = ["AGENDADO", "CONFIRMADO"]
    if (!resendableStatuses.includes(appointment.status)) {
      return NextResponse.json(
        { error: `Nao e possivel reenviar confirmacao para agendamento com status "${appointment.status}"` },
        { status: 400 }
      )
    }

    // Check cooldown period - look at the last confirmation notification sent
    if (appointment.notifications.length > 0) {
      const lastNotification = appointment.notifications[0]
      const timeSinceLastSend = Date.now() - new Date(lastNotification.createdAt).getTime()

      if (timeSinceLastSend < RESEND_COOLDOWN_MS) {
        const remainingMinutes = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastSend) / (60 * 1000))
        return NextResponse.json(
          {
            error: `Aguarde ${remainingMinutes} minuto(s) antes de reenviar a confirmacao`,
            remainingMinutes,
          },
          { status: 429 }
        )
      }
    }

    // Check if patient exists (only CONSULTA has patients)
    const patient = appointment.patient
    if (!patient) {
      return NextResponse.json(
        { error: "Este agendamento nao possui paciente associado" },
        { status: 400 }
      )
    }
    if (!patient.consentWhatsApp && !patient.consentEmail) {
      return NextResponse.json(
        { error: "Paciente nao possui consentimento para receber notificacoes" },
        { status: 400 }
      )
    }

    // Check if patient has valid contact info
    if (!patient.phone && !patient.email) {
      return NextResponse.json(
        { error: "Paciente nao possui telefone ou email cadastrado" },
        { status: 400 }
      )
    }

    // Regenerate tokens (invalidates old ones) within a transaction
    const tokens = await prisma.$transaction(async (tx) => {
      return regenerateAppointmentTokens(
        appointment.id,
        new Date(appointment.scheduledAt),
        tx
      )
    })

    // Build notification content
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const confirmLink = buildConfirmLink(baseUrl, tokens.confirmToken)
    const cancelLink = buildCancelLink(baseUrl, tokens.cancelToken)

    const professionalName = appointment.professionalProfile.user.name
    const scheduledDate = new Date(appointment.scheduledAt)
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

    const notificationContent = `Ola ${patient.name}!\n\nEstamos reenviando os links de confirmacao do seu agendamento.\n\n📅 Data: ${formattedDate}\n🕐 Horario: ${formattedTime}\n👨‍⚕️ Profissional: ${professionalName}\n📍 Modalidade: ${appointment.modality === "ONLINE" ? "Online" : "Presencial"}\n\nPara confirmar seu agendamento, acesse:\n${confirmLink}\n\nPara cancelar, acesse:\n${cancelLink}`

    // Send notifications based on consent
    const notificationsSent: string[] = []

    // Send WhatsApp notification if consent exists
    if (patient.consentWhatsApp && patient.phone) {
      try {
        await createAndSendNotification({
          clinicId: user.clinicId,
          patientId: patient.id,
          appointmentId: appointment.id,
          type: NotificationType.APPOINTMENT_CONFIRMATION,
          channel: NotificationChannel.WHATSAPP,
          recipient: patient.phone,
          content: notificationContent,
        })
        notificationsSent.push("WhatsApp")
      } catch {
        // Log error but continue with other notifications
        console.error("Failed to send WhatsApp notification")
      }
    }

    // Send email notification if consent exists
    if (patient.consentEmail && patient.email) {
      try {
        await createAndSendNotification({
          clinicId: user.clinicId,
          patientId: patient.id,
          appointmentId: appointment.id,
          type: NotificationType.APPOINTMENT_CONFIRMATION,
          channel: NotificationChannel.EMAIL,
          recipient: patient.email,
          subject: "Confirmacao de Agendamento - Reenvio",
          content: notificationContent,
        })
        notificationsSent.push("Email")
      } catch {
        // Log error but continue
        console.error("Failed to send email notification")
      }
    }

    // Create audit log entry
    await audit.log({
      user,
      action: AuditAction.CONFIRMATION_RESENT,
      entityType: "Appointment",
      entityId: appointment.id,
      newValues: {
        patientId: patient.id,
        patientName: patient.name,
        notificationsSent,
        tokensRegenerated: true,
      },
      request: req,
    })

    return NextResponse.json({
      success: true,
      message: "Links de confirmacao reenviados com sucesso",
      notificationsSent,
      tokens: {
        expiresAt: tokens.expiresAt,
      },
    })
  }
)
