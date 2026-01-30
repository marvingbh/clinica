import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth } from "@/lib/api"
import { calculateGroupSessionDates, filterExistingSessionDates } from "@/lib/groups"
import { createAppointmentTokens, buildConfirmLink, buildCancelLink } from "@/lib/appointments"
import { createNotification } from "@/lib/notifications"
import { NotificationChannel, NotificationType, AppointmentModality } from "@/generated/prisma/client"
import { z } from "zod"

const generateSessionsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
})

/**
 * POST /api/groups/[groupId]/sessions
 * Generate sessions (appointments) for the group within a date range
 */
export const POST = withAuth(
  { resource: "therapy-group", action: "update" },
  async (req, { user, scope }, params) => {
    const { groupId } = params
    const body = await req.json()

    // Validate request body
    const validation = generateSessionsSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { startDate, endDate } = validation.data

    // Validate date range
    const start = new Date(startDate + "T00:00:00")
    const end = new Date(endDate + "T23:59:59.999")

    if (start > end) {
      return NextResponse.json(
        { error: "Data inicial deve ser anterior à data final" },
        { status: 400 }
      )
    }

    // Limit to 1 year max
    const oneYearMs = 365 * 24 * 60 * 60 * 1000
    if (end.getTime() - start.getTime() > oneYearMs) {
      return NextResponse.json(
        { error: "Intervalo máximo de 1 ano" },
        { status: 400 }
      )
    }

    // Build where clause for group access
    const groupWhere: Record<string, unknown> = {
      id: groupId,
      clinicId: user.clinicId,
      isActive: true,
    }

    // If scope is "own", only allow access to own groups
    if (scope === "own" && user.professionalProfileId) {
      groupWhere.professionalProfileId = user.professionalProfileId
    }

    // Get the group
    const group = await prisma.therapyGroup.findFirst({
      where: groupWhere,
      include: {
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

    if (!group) {
      return NextResponse.json(
        { error: "Grupo não encontrado ou inativo" },
        { status: 404 }
      )
    }

    // Get active members as of start date
    const activeMembers = await prisma.groupMembership.findMany({
      where: {
        groupId,
        joinDate: { lte: end },
        OR: [
          { leaveDate: null },
          { leaveDate: { gt: start } },
        ],
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            consentWhatsApp: true,
            consentEmail: true,
          },
        },
      },
    })

    if (activeMembers.length === 0) {
      return NextResponse.json(
        { error: "Nenhum membro ativo neste grupo" },
        { status: 400 }
      )
    }

    // Calculate session dates
    const allSessionDates = calculateGroupSessionDates(
      startDate,
      endDate,
      group.dayOfWeek,
      group.startTime,
      group.duration,
      group.recurrenceType
    )

    if (allSessionDates.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma sessão a ser gerada no intervalo especificado" },
        { status: 400 }
      )
    }

    // Get existing session times for this group
    const existingSessions = await prisma.appointment.findMany({
      where: {
        groupId,
        scheduledAt: { gte: start, lte: end },
      },
      select: {
        scheduledAt: true,
      },
      distinct: ["scheduledAt"],
    })

    const existingSessionTimes = existingSessions.map(s => s.scheduledAt)

    // Filter out already existing sessions
    const newSessionDates = filterExistingSessionDates(allSessionDates, existingSessionTimes)

    if (newSessionDates.length === 0) {
      return NextResponse.json({
        message: "Todas as sessões no intervalo já foram geradas",
        sessionsCreated: 0,
        appointmentsCreated: 0,
      })
    }

    // Create appointments for each session date and each active member
    const result = await prisma.$transaction(async (tx) => {
      const createdAppointments = []
      const createdTokens = []

      for (const sessionDate of newSessionDates) {
        // Filter members who are active for this specific date
        const membersForDate = activeMembers.filter(member => {
          const joinDate = new Date(member.joinDate)
          const leaveDate = member.leaveDate ? new Date(member.leaveDate) : null

          const sessionDateObj = new Date(sessionDate.date + "T00:00:00")

          // Member must have joined before or on the session date
          if (joinDate > sessionDateObj) return false

          // If member has left, they must have left after the session date
          if (leaveDate && leaveDate <= sessionDateObj) return false

          return true
        })

        // Create an appointment for each member
        for (const member of membersForDate) {
          const appointment = await tx.appointment.create({
            data: {
              clinicId: user.clinicId,
              professionalProfileId: group.professionalProfileId,
              patientId: member.patientId,
              groupId: group.id,
              scheduledAt: sessionDate.scheduledAt,
              endAt: sessionDate.endAt,
              modality: AppointmentModality.PRESENCIAL,
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
          })

          // Create tokens for confirm/cancel actions
          const tokens = await createAppointmentTokens(appointment.id, sessionDate.scheduledAt, tx)

          createdAppointments.push(appointment)
          createdTokens.push({ appointment, tokens, member })
        }
      }

      return { createdAppointments, createdTokens }
    })

    // Queue notifications for created appointments (async, non-blocking)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      const professionalName = group.professionalProfile.user.name

      for (const { appointment, tokens, member } of result.createdTokens) {
        const confirmLink = buildConfirmLink(baseUrl, tokens.confirmToken)
        const cancelLink = buildCancelLink(baseUrl, tokens.cancelToken)

        const formattedDate = appointment.scheduledAt.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
        const formattedTime = appointment.scheduledAt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })

        const notificationContent = `Ola ${member.patient.name}!\n\nVoce foi agendado(a) para a sessao do grupo "${group.name}".\n\n📅 Data: ${formattedDate}\n🕐 Horario: ${formattedTime}\n👨‍⚕️ Profissional: ${professionalName}\n\nPara confirmar sua presenca, acesse:\n${confirmLink}\n\nPara cancelar, acesse:\n${cancelLink}`

        // Queue WhatsApp notification if patient has consent
        if (member.patient.consentWhatsApp && member.patient.phone) {
          createNotification({
            clinicId: user.clinicId,
            patientId: member.patientId,
            appointmentId: appointment.id,
            type: NotificationType.APPOINTMENT_CONFIRMATION,
            channel: NotificationChannel.WHATSAPP,
            recipient: member.patient.phone,
            content: notificationContent,
          }).catch(() => {
            // Silently ignore - notification failure should not affect session generation
          })
        }

        // Queue email notification if patient has consent
        if (member.patient.consentEmail && member.patient.email) {
          createNotification({
            clinicId: user.clinicId,
            patientId: member.patientId,
            appointmentId: appointment.id,
            type: NotificationType.APPOINTMENT_CONFIRMATION,
            channel: NotificationChannel.EMAIL,
            recipient: member.patient.email,
            subject: `Sessao de Grupo Agendada - ${group.name}`,
            content: notificationContent,
          }).catch(() => {
            // Silently ignore
          })
        }
      }
    } catch {
      // Silently ignore notification errors - session generation succeeded
    }

    return NextResponse.json({
      message: "Sessões geradas com sucesso",
      sessionsCreated: newSessionDates.length,
      appointmentsCreated: result.createdAppointments.length,
      sessions: newSessionDates.map(s => ({
        date: s.date,
        scheduledAt: s.scheduledAt.toISOString(),
        endAt: s.endAt.toISOString(),
      })),
    }, { status: 201 })
  }
)
