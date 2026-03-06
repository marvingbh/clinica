import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { createAuditLog } from "@/lib/rbac/audit"
import { AppointmentStatus } from "@prisma/client"
import {
  computeStatusUpdateData,
  shouldUpdateLastVisitAt,
} from "@/lib/appointments/status-transitions"
import {
  getAppointmentsToUpdate,
  shouldCreateCredit,
  shouldCleanupCredit,
  hasUnownedAppointments,
  getUniquePatientIds,
  buildCreditReason,
} from "@/lib/groups/bulk-status"

/**
 * PATCH /api/group-sessions/status
 * Bulk-update all appointments in a group session to a new status.
 *
 * Body: { groupId: string, scheduledAt: string, status: AppointmentStatus }
 *
 * Finds all appointments matching groupId + same day as scheduledAt + clinicId,
 * then updates them all in a single transaction. Does NOT validate transitions
 * (bulk actions override all participants including terminal states).
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")

    // Parse request body
    let body: { groupId?: string; scheduledAt?: string; status?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Requisicao invalida" },
        { status: 400 }
      )
    }

    const { groupId, scheduledAt, status: newStatus } = body

    // Validate required fields
    if (!groupId || !scheduledAt || !newStatus) {
      return NextResponse.json(
        { error: "groupId, scheduledAt e status sao obrigatorios" },
        { status: 400 }
      )
    }

    // Validate status is a valid enum value
    if (!Object.values(AppointmentStatus).includes(newStatus as AppointmentStatus)) {
      return NextResponse.json(
        { error: `Status "${newStatus}" nao e valido` },
        { status: 400 }
      )
    }

    const targetStatus = newStatus as AppointmentStatus

    // Build date range for the same day as scheduledAt
    const scheduledDate = new Date(scheduledAt)
    const dayStart = new Date(scheduledDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledDate)
    dayEnd.setHours(23, 59, 59, 999)

    // Find all appointments for this group session
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        groupId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        patient: { select: { id: true, name: true } },
        additionalProfessionals: {
          select: { professionalProfileId: true },
        },
      },
    })

    if (appointments.length === 0) {
      return NextResponse.json(
        { error: "Nenhum agendamento encontrado para esta sessao de grupo" },
        { status: 404 }
      )
    }

    // Check ownership if user cannot manage others' appointments
    if (!canSeeOthers && user.professionalProfileId) {
      if (hasUnownedAppointments(appointments, user.professionalProfileId)) {
        return forbiddenResponse("Voce so pode atualizar seus proprios agendamentos")
      }
    }

    // Filter out appointments already in the target status
    const toUpdate = getAppointmentsToUpdate(appointments, targetStatus)

    if (toUpdate.length === 0) {
      return NextResponse.json({ success: true, updatedCount: 0 })
    }

    // Prepare update data with timestamps
    const now = new Date()
    const updateData = computeStatusUpdateData(targetStatus, now)

    // Run all updates in a single transaction
    const oldStatuses = new Map(toUpdate.map(apt => [apt.id, apt.status]))

    await prisma.$transaction(async (tx) => {
      // Update all appointments
      for (const apt of toUpdate) {
        await tx.appointment.update({
          where: { id: apt.id },
          data: updateData,
        })
      }

      // Credit management
      for (const apt of toUpdate) {
        if (shouldCreateCredit(apt, targetStatus)) {
          await tx.sessionCredit.create({
            data: {
              clinicId: user.clinicId,
              professionalProfileId: apt.professionalProfileId,
              patientId: apt.patientId!,
              originAppointmentId: apt.id,
              reason: buildCreditReason(apt.scheduledAt),
            },
          })
          await tx.appointment.update({
            where: { id: apt.id },
            data: { creditGenerated: true },
          })
        }

        if (shouldCleanupCredit(apt.status, targetStatus)) {
          await tx.sessionCredit.deleteMany({
            where: {
              originAppointmentId: apt.id,
              consumedByInvoiceId: null,
            },
          })
          await tx.appointment.update({
            where: { id: apt.id },
            data: { creditGenerated: false },
          })
        }
      }

      // Update patient lastVisitAt for FINALIZADO
      if (shouldUpdateLastVisitAt(targetStatus)) {
        const uniquePatientIds = getUniquePatientIds(toUpdate)
        for (const patientId of uniquePatientIds) {
          const apt = toUpdate.find(a => a.patientId === patientId)!
          await tx.patient.update({
            where: { id: patientId },
            data: { lastVisitAt: apt.scheduledAt },
          })
        }
      }
    })

    // Create audit logs OUTSIDE the transaction (createAuditLog uses global prisma)
    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    const newValuesLog: Record<string, string> = { status: targetStatus }
    if (updateData.confirmedAt) {
      newValuesLog.confirmedAt = (updateData.confirmedAt as Date).toISOString()
    }
    if (updateData.cancelledAt) {
      newValuesLog.cancelledAt = (updateData.cancelledAt as Date).toISOString()
    }

    await Promise.all(
      toUpdate.map(apt =>
        createAuditLog({
          user,
          action: "APPOINTMENT_STATUS_CHANGED",
          entityType: "Appointment",
          entityId: apt.id,
          oldValues: { status: oldStatuses.get(apt.id)! },
          newValues: newValuesLog,
          ipAddress,
          userAgent,
        })
      )
    )

    return NextResponse.json({ success: true, updatedCount: toUpdate.length })
  }
)
