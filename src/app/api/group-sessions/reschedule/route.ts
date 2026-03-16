import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"

/**
 * PATCH /api/group-sessions/reschedule
 * Bulk-update scheduledAt/endAt for all appointments in a one-off group session.
 *
 * Body: { sessionGroupId: string, scheduledAt: string, newScheduledAt: string, newEndAt: string }
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")

    let body: { sessionGroupId?: string; scheduledAt?: string; newScheduledAt?: string; newEndAt?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
    }

    const { sessionGroupId, scheduledAt, newScheduledAt, newEndAt } = body

    if (!sessionGroupId || !scheduledAt || !newScheduledAt || !newEndAt) {
      return NextResponse.json(
        { error: "sessionGroupId, scheduledAt, newScheduledAt e newEndAt sao obrigatorios" },
        { status: 400 }
      )
    }

    // Find all appointments for this one-off group session on the same day
    const scheduledDate = new Date(scheduledAt)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        sessionGroupId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true, professionalProfileId: true },
    })

    if (appointments.length === 0) {
      return NextResponse.json({ error: "Nenhum agendamento encontrado" }, { status: 404 })
    }

    // Check ownership
    if (!canSeeOthers && user.professionalProfileId) {
      const hasUnowned = appointments.some(a => a.professionalProfileId !== user.professionalProfileId)
      if (hasUnowned) {
        return forbiddenResponse("Voce so pode atualizar seus proprios agendamentos")
      }
    }

    // Bulk update all appointments
    await prisma.appointment.updateMany({
      where: {
        clinicId: user.clinicId,
        sessionGroupId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      data: {
        scheduledAt: new Date(newScheduledAt),
        endAt: new Date(newEndAt),
      },
    })

    return NextResponse.json({ success: true, updatedCount: appointments.length })
  }
)
