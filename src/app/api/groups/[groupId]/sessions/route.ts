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
  mode: z.enum(["generate", "regenerate"]).optional().default("generate"),
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

    const { startDate, endDate, mode } = validation.data

    // Validate date range
    const start = new Date(startDate + "T00:00:00")
    const end = new Date(endDate + "T23:59:59.999")

    if (start > end) {
      return NextResponse.json(
        { error: "Data inicial deve ser anterior à data final" },
        { status: 400 }
      )
    }

    // Limit to 1 year max (only for generate mode, regenerate updates existing sessions)
    if (mode !== "regenerate") {
      const oneYearMs = 365 * 24 * 60 * 60 * 1000
      if (end.getTime() - start.getTime() > oneYearMs) {
        return NextResponse.json(
          { error: "Intervalo máximo de 1 ano" },
          { status: 400 }
        )
      }
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

    // For regenerate mode, get actual date range from existing future sessions
    let effectiveStart = start
    let effectiveEnd = end

    if (mode === "regenerate") {
      const now = new Date()
      now.setHours(0, 0, 0, 0)

      // Get the date range of existing future sessions for this group
      const sessionRange = await prisma.appointment.aggregate({
        where: {
          groupId,
          scheduledAt: { gte: now },
          status: { in: ["AGENDADO", "CONFIRMADO"] },
        },
        _min: { scheduledAt: true },
        _max: { scheduledAt: true },
      })

      if (!sessionRange._min.scheduledAt || !sessionRange._max.scheduledAt) {
        return NextResponse.json({
          message: "Nenhuma sessão futura encontrada para atualizar",
          sessionsCreated: 0,
          appointmentsCreated: 0,
          regeneratedCount: 0,
          cancelledCount: 0,
        })
      }

      // Use actual range from database
      effectiveStart = sessionRange._min.scheduledAt
      effectiveEnd = new Date(sessionRange._max.scheduledAt)
      effectiveEnd.setHours(23, 59, 59, 999)
    }

    // Get active members as of date range
    const activeMembers = await prisma.groupMembership.findMany({
      where: {
        groupId,
        joinDate: { lte: effectiveEnd },
        OR: [
          { leaveDate: null },
          { leaveDate: { gt: effectiveStart } },
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

    // Get existing session times for this group
    const existingSessions = await prisma.appointment.findMany({
      where: {
        groupId,
        scheduledAt: { gte: effectiveStart, lte: effectiveEnd },
      },
      select: {
        scheduledAt: true,
        patientId: true,
      },
    })

    const existingSessionTimes = [...new Set(existingSessions.map(s => s.scheduledAt.toISOString()))]
      .map(iso => new Date(iso))

    // Calculate new session dates only for generate mode
    let newSessionDates: ReturnType<typeof calculateGroupSessionDates> = []
    if (mode !== "regenerate") {
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

      // Filter out already existing sessions for new session generation
      newSessionDates = filterExistingSessionDates(allSessionDates, existingSessionTimes)
    }

    // Handle regenerate mode - add missing members and remove left members from existing sessions
    let regeneratedCount = 0
    let cancelledCount = 0

    if (mode === "regenerate" && existingSessionTimes.length > 0) {
      // Get ALL memberships to identify who has left
      const allMemberships = await prisma.groupMembership.findMany({
        where: { groupId },
        select: {
          patientId: true,
          joinDate: true,
          leaveDate: true,
        },
      })

      // Group existing appointments by scheduledAt time
      const existingBySession = new Map<string, Set<string>>()
      for (const appt of existingSessions) {
        const key = appt.scheduledAt.toISOString()
        if (!existingBySession.has(key)) {
          existingBySession.set(key, new Set())
        }
        existingBySession.get(key)!.add(appt.patientId)
      }

      // For each existing session, find and add missing members + cancel left members
      const regenerateResult = await prisma.$transaction(async (tx) => {
        const created = []
        const tokens = []
        let cancelled = 0

        for (const sessionTime of existingSessionTimes) {
          const sessionKey = sessionTime.toISOString()
          const existingPatientIds = existingBySession.get(sessionKey) || new Set()
          const sessionDateObj = new Date(sessionTime)
          sessionDateObj.setHours(0, 0, 0, 0)

          // Find members who should be in this session but aren't
          const missingMembers = activeMembers.filter(member => {
            // Skip if already has appointment for this session
            if (existingPatientIds.has(member.patientId)) return false

            const joinDate = new Date(member.joinDate)
            joinDate.setHours(0, 0, 0, 0)
            const leaveDate = member.leaveDate ? new Date(member.leaveDate) : null
            if (leaveDate) leaveDate.setHours(0, 0, 0, 0)

            // Member must have joined before or on the session date
            if (joinDate > sessionDateObj) return false

            // If member has left, they must have left after the session date
            if (leaveDate && leaveDate <= sessionDateObj) return false

            return true
          })

          // Find patients who have appointments but should NOT (left the group or session is before join date)
          const patientsToRemove: string[] = []
          for (const patientId of existingPatientIds) {
            const membership = allMemberships.find(m => m.patientId === patientId)
            if (!membership) {
              // Patient is not a member at all - should be removed
              patientsToRemove.push(patientId)
              continue
            }

            const joinDate = new Date(membership.joinDate)
            joinDate.setHours(0, 0, 0, 0)
            const leaveDate = membership.leaveDate ? new Date(membership.leaveDate) : null
            if (leaveDate) leaveDate.setHours(0, 0, 0, 0)

            // Session is before member joined
            if (sessionDateObj < joinDate) {
              patientsToRemove.push(patientId)
              continue
            }

            // Member has left and leave date is on or before the session date
            if (leaveDate && leaveDate <= sessionDateObj) {
              patientsToRemove.push(patientId)
              continue
            }
          }

          // Cancel appointments for patients who should be removed
          if (patientsToRemove.length > 0) {
            const cancelResult = await tx.appointment.updateMany({
              where: {
                groupId,
                scheduledAt: sessionTime,
                patientId: { in: patientsToRemove },
                status: { in: ["AGENDADO", "CONFIRMADO"] }, // Only cancel non-finalized appointments
              },
              data: {
                status: "CANCELADO_PROFISSIONAL",
              },
            })
            cancelled += cancelResult.count
          }

          // Create appointments for missing members
          for (const member of missingMembers) {
            const endAt = new Date(sessionTime.getTime() + group.duration * 60 * 1000)

            const appointment = await tx.appointment.create({
              data: {
                clinicId: user.clinicId,
                professionalProfileId: group.professionalProfileId,
                patientId: member.patientId,
                groupId: group.id,
                scheduledAt: sessionTime,
                endAt,
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
            const appointmentTokens = await createAppointmentTokens(appointment.id, sessionTime, tx)

            created.push(appointment)
            tokens.push({ appointment, tokens: appointmentTokens, member })
          }
        }

        return { created, tokens, cancelled }
      })

      regeneratedCount = regenerateResult.created.length
      cancelledCount = regenerateResult.cancelled

      // Queue notifications for regenerated appointments
      if (regenerateResult.tokens.length > 0) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          const professionalName = group.professionalProfile.user.name

          for (const { appointment, tokens: tkns, member } of regenerateResult.tokens) {
            const confirmLink = buildConfirmLink(baseUrl, tkns.confirmToken)
            const cancelLink = buildCancelLink(baseUrl, tkns.cancelToken)

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

            const notificationContent = `Ola ${member.patient.name}!\n\nVoce foi adicionado(a) às sessões do grupo "${group.name}".\n\n📅 Data: ${formattedDate}\n🕐 Horario: ${formattedTime}\n👨‍⚕️ Profissional: ${professionalName}\n\nPara confirmar sua presenca, acesse:\n${confirmLink}\n\nPara cancelar, acesse:\n${cancelLink}`

            if (member.patient.consentWhatsApp && member.patient.phone) {
              createNotification({
                clinicId: user.clinicId,
                patientId: member.patientId,
                appointmentId: appointment.id,
                type: NotificationType.APPOINTMENT_CONFIRMATION,
                channel: NotificationChannel.WHATSAPP,
                recipient: member.patient.phone,
                content: notificationContent,
              }).catch(() => {})
            }

            if (member.patient.consentEmail && member.patient.email) {
              createNotification({
                clinicId: user.clinicId,
                patientId: member.patientId,
                appointmentId: appointment.id,
                type: NotificationType.APPOINTMENT_CONFIRMATION,
                channel: NotificationChannel.EMAIL,
                recipient: member.patient.email,
                subject: `Adicionado ao Grupo - ${group.name}`,
                content: notificationContent,
              }).catch(() => {})
            }
          }
        } catch {
          // Silently ignore notification errors
        }
      }
    }

    // If no new sessions to create and no regenerated/cancelled appointments
    if (newSessionDates.length === 0 && regeneratedCount === 0 && cancelledCount === 0) {
      return NextResponse.json({
        message: mode === "regenerate"
          ? "Todas as sessões já estão atualizadas"
          : "Todas as sessões no intervalo já foram geradas",
        sessionsCreated: 0,
        appointmentsCreated: 0,
        regeneratedCount: 0,
        cancelledCount: 0,
      })
    }

    // If only regenerated/cancelled (no new sessions to create)
    if (newSessionDates.length === 0) {
      const messageParts: string[] = []
      if (regeneratedCount > 0) {
        messageParts.push(`${regeneratedCount} agendamento(s) adicionado(s)`)
      }
      if (cancelledCount > 0) {
        messageParts.push(`${cancelledCount} agendamento(s) cancelado(s)`)
      }
      return NextResponse.json({
        message: messageParts.join(", ") || "Sessões atualizadas",
        sessionsCreated: 0,
        appointmentsCreated: regeneratedCount,
        regeneratedCount,
        cancelledCount,
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

    const totalAppointments = result.createdAppointments.length + regeneratedCount
    const message = regeneratedCount > 0
      ? `${newSessionDates.length} sessão(ões) criada(s), ${regeneratedCount} agendamento(s) adicionado(s) a sessões existentes`
      : "Sessões geradas com sucesso"

    return NextResponse.json({
      message,
      sessionsCreated: newSessionDates.length,
      appointmentsCreated: totalAppointments,
      regeneratedCount,
      sessions: newSessionDates.map(s => ({
        date: s.date,
        scheduledAt: s.scheduledAt.toISOString(),
        endAt: s.endAt.toISOString(),
      })),
    }, { status: 201 })
  }
)
