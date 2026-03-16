import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { checkConflictsBulk, formatConflictError } from "@/lib/appointments"
import { createAuditLog } from "@/lib/rbac/audit"

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

    const scheduledDate = new Date(scheduledAt)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)

    const newStart = new Date(newScheduledAt)
    const newEnd = new Date(newEndAt)

    const result = await prisma.$transaction(async (tx) => {
      // Find all appointments in this session
      const appointments = await tx.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          sessionGroupId,
          scheduledAt: { gte: dayStart, lte: dayEnd },
        },
        select: {
          id: true,
          professionalProfileId: true,
          scheduledAt: true,
          additionalProfessionals: { select: { professionalProfileId: true } },
        },
      })

      if (appointments.length === 0) {
        return { error: "Nenhum agendamento encontrado", status: 404 }
      }

      // Check ownership
      if (!canSeeOthers && user.professionalProfileId) {
        const hasUnowned = appointments.some(a => a.professionalProfileId !== user.professionalProfileId)
        if (hasUnowned) {
          return { error: "Voce so pode atualizar seus proprios agendamentos", status: 403 }
        }
      }

      // Check conflicts at the new time slot (exclude this session's own appointments)
      const profId = appointments[0].professionalProfileId
      const addlProfIds = appointments[0].additionalProfessionals.map(ap => ap.professionalProfileId)
      const conflictResult = await checkConflictsBulk({
        professionalProfileId: profId,
        dates: [{ scheduledAt: newStart, endAt: newEnd }],
        additionalProfessionalIds: addlProfIds,
        excludeAppointmentIds: appointments.map(a => a.id),
      }, tx)

      if (conflictResult.conflicts.length > 0) {
        return { conflict: conflictResult.conflicts[0].conflictingAppointment }
      }

      // Update all appointments
      const updateResult = await tx.appointment.updateMany({
        where: { id: { in: appointments.map(a => a.id) } },
        data: { scheduledAt: newStart, endAt: newEnd },
      })

      return { appointments, updatedCount: updateResult.count }
    })

    // Handle errors from transaction
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    if ("conflict" in result && result.conflict) {
      return NextResponse.json(formatConflictError(result.conflict), { status: 409 })
    }

    // Audit logs (outside transaction)
    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    await Promise.all(
      result.appointments.map(apt =>
        createAuditLog({
          user,
          action: "APPOINTMENT_UPDATED",
          entityType: "Appointment",
          entityId: apt.id,
          oldValues: { scheduledAt: apt.scheduledAt.toISOString() },
          newValues: { scheduledAt: newStart.toISOString(), endAt: newEnd.toISOString(), sessionGroupId },
          ipAddress,
          userAgent,
        })
      )
    )

    return NextResponse.json({ success: true, updatedCount: result.updatedCount })
  }
)
