import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { calculateGroupSessionDates, filterExistingSessionDates } from "@/lib/groups"
import { createBulkAppointmentTokens, buildConfirmLink, buildCancelLink } from "@/lib/appointments"
import { createNotification } from "@/lib/notifications"
import { NotificationChannel, NotificationType, AppointmentModality } from "@prisma/client"
import { z } from "zod"

const generateSessionsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
  mode: z.enum(["generate", "regenerate", "reschedule"]).optional().default("generate"),
})

/**
 * POST /api/groups/[groupId]/sessions
 * Generate sessions (appointments) for the group within a date range
 */
export const POST = withFeatureAuth(
  { feature: "groups", minAccess: "WRITE" },
  async (req, { user }, params) => {
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

    // Get the group with additional professionals
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
        additionalProfessionals: {
          select: { professionalProfileId: true },
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

    // Handle reschedule mode: cancel all future sessions, then generate new ones
    let rescheduleCancelledCount = 0
    if (mode === "reschedule") {
      const now = new Date()
      const cancelResult = await prisma.appointment.updateMany({
        where: {
          groupId,
          scheduledAt: { gte: now },
          status: { in: ["AGENDADO", "CONFIRMADO"] },
        },
        data: { status: "CANCELADO_PROFISSIONAL" },
      })
      rescheduleCancelledCount = cancelResult.count
    }

    // Get existing session times for this group
    // For reschedule mode, exclude cancelled sessions since we just cancelled them
    const existingSessionsWhere: Record<string, unknown> = {
      groupId,
      scheduledAt: { gte: effectiveStart, lte: effectiveEnd },
    }
    if (mode === "reschedule") {
      existingSessionsWhere.status = { in: ["AGENDADO", "CONFIRMADO"] }
    }
    const existingSessions = await prisma.appointment.findMany({
      where: existingSessionsWhere,
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
        if (appt.patientId) {
          existingBySession.get(key)!.add(appt.patientId)
        }
      }

      // For each existing session, find and add missing members + cancel left members
      const regenerateResult = await prisma.$transaction(async (tx) => {
        let cancelled = 0

        // Collect all appointments to create and patients to remove across sessions
        const appointmentsToCreate: Array<{
          clinicId: string
          professionalProfileId: string
          patientId: string
          groupId: string
          scheduledAt: Date
          endAt: Date
          modality: typeof AppointmentModality.PRESENCIAL
        }> = []
        const allPatientsToRemoveBySession: Array<{ sessionTime: Date; patientIds: string[] }> = []

        for (const sessionTime of existingSessionTimes) {
          const sessionKey = sessionTime.toISOString()
          const existingPatientIds = existingBySession.get(sessionKey) || new Set()
          const sessionDateObj = new Date(sessionTime)
          sessionDateObj.setHours(0, 0, 0, 0)

          // Find members who should be in this session but aren't
          const missingMembers = activeMembers.filter(member => {
            if (existingPatientIds.has(member.patientId)) return false
            const joinDate = new Date(member.joinDate)
            joinDate.setHours(0, 0, 0, 0)
            const leaveDate = member.leaveDate ? new Date(member.leaveDate) : null
            if (leaveDate) leaveDate.setHours(0, 0, 0, 0)
            if (joinDate > sessionDateObj) return false
            if (leaveDate && leaveDate <= sessionDateObj) return false
            return true
          })

          // Find patients who have appointments but should NOT
          const patientsToRemove: string[] = []
          for (const patientId of existingPatientIds) {
            const membership = allMemberships.find(m => m.patientId === patientId)
            if (!membership) { patientsToRemove.push(patientId); continue }
            const joinDate = new Date(membership.joinDate)
            joinDate.setHours(0, 0, 0, 0)
            const leaveDate = membership.leaveDate ? new Date(membership.leaveDate) : null
            if (leaveDate) leaveDate.setHours(0, 0, 0, 0)
            if (sessionDateObj < joinDate) { patientsToRemove.push(patientId); continue }
            if (leaveDate && leaveDate <= sessionDateObj) { patientsToRemove.push(patientId); continue }
          }

          if (patientsToRemove.length > 0) {
            allPatientsToRemoveBySession.push({ sessionTime, patientIds: patientsToRemove })
          }

          const endAt = new Date(sessionTime.getTime() + group.duration * 60 * 1000)
          for (const member of missingMembers) {
            appointmentsToCreate.push({
              clinicId: user.clinicId,
              professionalProfileId: group.professionalProfileId,
              patientId: member.patientId,
              groupId: group.id,
              scheduledAt: sessionTime,
              endAt,
              modality: AppointmentModality.PRESENCIAL,
            })
          }
        }

        // Bulk cancel
        for (const { sessionTime, patientIds } of allPatientsToRemoveBySession) {
          const cancelResult = await tx.appointment.updateMany({
            where: {
              groupId,
              scheduledAt: sessionTime,
              patientId: { in: patientIds },
              status: { in: ["AGENDADO", "CONFIRMADO"] },
            },
            data: { status: "CANCELADO_PROFISSIONAL" },
          })
          cancelled += cancelResult.count
        }

        // Bulk create appointments
        if (appointmentsToCreate.length > 0) {
          await tx.appointment.createMany({ data: appointmentsToCreate })
        }

        // Create additional professional records for newly created appointments
        const regenGroupAdditionalProfIds = group.additionalProfessionals.map(ap => ap.professionalProfileId)
        if (appointmentsToCreate.length > 0 && regenGroupAdditionalProfIds.length > 0) {
          const newAppts = await tx.appointment.findMany({
            where: {
              groupId: group.id,
              scheduledAt: { in: appointmentsToCreate.map(a => a.scheduledAt) },
              patientId: { in: appointmentsToCreate.map(a => a.patientId) },
            },
            select: { id: true },
          })
          await tx.appointmentProfessional.createMany({
            data: newAppts.flatMap(apt =>
              regenGroupAdditionalProfIds.map(profId => ({
                appointmentId: apt.id,
                professionalProfileId: profId,
              }))
            ),
          })
        }

        // Fetch created appointments with patient info for notifications
        const created = appointmentsToCreate.length > 0
          ? await tx.appointment.findMany({
              where: {
                groupId: group.id,
                scheduledAt: { in: appointmentsToCreate.map(a => a.scheduledAt) },
                patientId: { in: appointmentsToCreate.map(a => a.patientId) },
              },
              include: {
                patient: {
                  select: { id: true, name: true, email: true, phone: true, consentWhatsApp: true, consentEmail: true },
                },
              },
              orderBy: { scheduledAt: "asc" },
            })
          : []

        // Bulk create tokens
        if (created.length > 0) {
          await createBulkAppointmentTokens(
            created.map(a => ({ id: a.id, scheduledAt: a.scheduledAt })),
            tx
          )
        }

        return { created, cancelled }
      }, { timeout: 30000 })

      regeneratedCount = regenerateResult.created.length
      cancelledCount = regenerateResult.cancelled

      // Queue notifications for regenerated appointments
      if (regenerateResult.created.length > 0) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          const professionalName = group.professionalProfile.user.name

          // Fetch tokens for all created appointments
          const allTokens = await prisma.appointmentToken.findMany({
            where: { appointmentId: { in: regenerateResult.created.map(a => a.id) } },
          })
          const tokensByAppointment = new Map<string, { confirmToken: string; cancelToken: string }>()
          for (const t of allTokens) {
            const entry = tokensByAppointment.get(t.appointmentId) || { confirmToken: "", cancelToken: "" }
            if (t.action === "confirm") entry.confirmToken = t.token
            if (t.action === "cancel") entry.cancelToken = t.token
            tokensByAppointment.set(t.appointmentId, entry)
          }

          for (const appointment of regenerateResult.created) {
            const tkns = tokensByAppointment.get(appointment.id)
            if (!tkns || !appointment.patient) continue

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

            const notificationContent = `Ola ${appointment.patient.name}!\n\nVoce foi adicionado(a) às sessões do grupo "${group.name}".\n\n📅 Data: ${formattedDate}\n🕐 Horario: ${formattedTime}\n👨‍⚕️ Profissional: ${professionalName}\n\nPara confirmar sua presenca, acesse:\n${confirmLink}\n\nPara cancelar, acesse:\n${cancelLink}`

            if (appointment.patient.phone) {
              createNotification({
                clinicId: user.clinicId,
                patientId: appointment.patient.id,
                appointmentId: appointment.id,
                type: NotificationType.APPOINTMENT_CONFIRMATION,
                channel: NotificationChannel.WHATSAPP,
                recipient: appointment.patient.phone,
                content: notificationContent,
              }).catch(() => {})
            }

            if (appointment.patient.email) {
              createNotification({
                clinicId: user.clinicId,
                patientId: appointment.patient.id,
                appointmentId: appointment.id,
                type: NotificationType.APPOINTMENT_CONFIRMATION,
                channel: NotificationChannel.EMAIL,
                recipient: appointment.patient.email,
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
    // Build all appointment data first, then bulk create
    const appointmentsData: Array<{
      clinicId: string
      professionalProfileId: string
      patientId: string
      groupId: string
      scheduledAt: Date
      endAt: Date
      modality: typeof AppointmentModality.PRESENCIAL
    }> = []

    for (const sessionDate of newSessionDates) {
      const membersForDate = activeMembers.filter(member => {
        const joinDate = new Date(member.joinDate)
        const leaveDate = member.leaveDate ? new Date(member.leaveDate) : null
        const sessionDateObj = new Date(sessionDate.date + "T00:00:00")
        if (joinDate > sessionDateObj) return false
        if (leaveDate && leaveDate <= sessionDateObj) return false
        return true
      })

      for (const member of membersForDate) {
        appointmentsData.push({
          clinicId: user.clinicId,
          professionalProfileId: group.professionalProfileId,
          patientId: member.patientId,
          groupId: group.id,
          scheduledAt: sessionDate.scheduledAt,
          endAt: sessionDate.endAt,
          modality: AppointmentModality.PRESENCIAL,
        })
      }
    }

    const groupAdditionalProfIds = group.additionalProfessionals.map(ap => ap.professionalProfileId)

    const result = await prisma.$transaction(async (tx) => {
      // Bulk create all appointments
      await tx.appointment.createMany({ data: appointmentsData })

      // Fetch created appointments with patient info
      const createdAppointments = await tx.appointment.findMany({
        where: {
          groupId: group.id,
          scheduledAt: { in: newSessionDates.map(s => s.scheduledAt) },
          patientId: { in: activeMembers.map(m => m.patientId) },
        },
        include: {
          patient: {
            select: { id: true, name: true, email: true, phone: true, consentWhatsApp: true, consentEmail: true },
          },
        },
        orderBy: { scheduledAt: "asc" },
      })

      // Create additional professional records for each created appointment
      if (groupAdditionalProfIds.length > 0) {
        await tx.appointmentProfessional.createMany({
          data: createdAppointments.flatMap(apt =>
            groupAdditionalProfIds.map(profId => ({
              appointmentId: apt.id,
              professionalProfileId: profId,
            }))
          ),
        })
      }

      // Bulk create tokens
      await createBulkAppointmentTokens(
        createdAppointments.map(a => ({ id: a.id, scheduledAt: a.scheduledAt })),
        tx
      )

      return { createdAppointments }
    }, { timeout: 30000 })

    // Queue notifications for created appointments (async, non-blocking)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      const professionalName = group.professionalProfile.user.name

      // Fetch tokens for notifications
      const allTokens = await prisma.appointmentToken.findMany({
        where: { appointmentId: { in: result.createdAppointments.map(a => a.id) } },
      })
      const tokensByAppointment = new Map<string, { confirmToken: string; cancelToken: string }>()
      for (const t of allTokens) {
        const entry = tokensByAppointment.get(t.appointmentId) || { confirmToken: "", cancelToken: "" }
        if (t.action === "confirm") entry.confirmToken = t.token
        if (t.action === "cancel") entry.cancelToken = t.token
        tokensByAppointment.set(t.appointmentId, entry)
      }

      for (const appointment of result.createdAppointments) {
        const tkns = tokensByAppointment.get(appointment.id)
        if (!tkns || !appointment.patient) continue

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

        const notificationContent = `Ola ${appointment.patient.name}!\n\nVoce foi agendado(a) para a sessao do grupo "${group.name}".\n\n📅 Data: ${formattedDate}\n🕐 Horario: ${formattedTime}\n👨‍⚕️ Profissional: ${professionalName}\n\nPara confirmar sua presenca, acesse:\n${confirmLink}\n\nPara cancelar, acesse:\n${cancelLink}`

        if (appointment.patient.phone) {
          createNotification({
            clinicId: user.clinicId,
            patientId: appointment.patient.id,
            appointmentId: appointment.id,
            type: NotificationType.APPOINTMENT_CONFIRMATION,
            channel: NotificationChannel.WHATSAPP,
            recipient: appointment.patient.phone,
            content: notificationContent,
          }).catch(() => {})
        }

        if (appointment.patient.email) {
          createNotification({
            clinicId: user.clinicId,
            patientId: appointment.patient.id,
            appointmentId: appointment.id,
            type: NotificationType.APPOINTMENT_CONFIRMATION,
            channel: NotificationChannel.EMAIL,
            recipient: appointment.patient.email,
            subject: `Sessao de Grupo Agendada - ${group.name}`,
            content: notificationContent,
          }).catch(() => {})
        }
      }
    } catch {
      // Silently ignore notification errors - session generation succeeded
    }

    const totalAppointments = result.createdAppointments.length + regeneratedCount
    const message = mode === "reschedule"
      ? `${rescheduleCancelledCount} sessão(ões) cancelada(s), ${newSessionDates.length} nova(s) sessão(ões) criada(s)`
      : regeneratedCount > 0
      ? `${newSessionDates.length} sessão(ões) criada(s), ${regeneratedCount} agendamento(s) adicionado(s) a sessões existentes`
      : "Sessões geradas com sucesso"

    return NextResponse.json({
      message,
      sessionsCreated: newSessionDates.length,
      appointmentsCreated: totalAppointments,
      regeneratedCount,
      cancelledCount: rescheduleCancelledCount,
      sessions: newSessionDates.map(s => ({
        date: s.date,
        scheduledAt: s.scheduledAt.toISOString(),
        endAt: s.endAt.toISOString(),
      })),
    }, { status: 201 })
  }
)
