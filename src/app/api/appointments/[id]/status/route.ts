import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { createAuditLog } from "@/lib/rbac/audit"
import { AppointmentStatus } from "@prisma/client"
import {
  VALID_TRANSITIONS,
  STATUS_LABELS,
  isValidTransition,
  computeStatusUpdateData,
  shouldUpdateLastVisitAt,
} from "@/lib/appointments/status-transitions"

/**
 * PATCH /api/appointments/:id/status
 * Update appointment status with transition validation
 *
 * Request body: { status: AppointmentStatus }
 *
 * Allowed transitions:
 * - AGENDADO → CONFIRMADO, FINALIZADO, CANCELADO_*
 * - CONFIRMADO → FINALIZADO, CANCELADO_*
 * - Terminal states (FINALIZADO, CANCELADO_*) → no transitions
 *
 * Note: For cancellations with reason and notifications, use POST /api/appointments/:id/cancel instead.
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")
    // Parse request body
    let body: { status?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Requisição inválida" },
        { status: 400 }
      )
    }

    const { status: newStatus } = body

    // Validate status is provided
    if (!newStatus || typeof newStatus !== "string") {
      return NextResponse.json(
        { error: "Status é obrigatório" },
        { status: 400 }
      )
    }

    // Validate status is a valid enum value
    if (!Object.values(AppointmentStatus).includes(newStatus as AppointmentStatus)) {
      return NextResponse.json(
        { error: `Status "${newStatus}" não é válido` },
        { status: 400 }
      )
    }

    // Fetch the appointment
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
        additionalProfessionals: {
          select: { professionalProfileId: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404 }
      )
    }

    // Check ownership if user cannot manage others' appointments
    const isParticipant = existing.additionalProfessionals.some(
      ap => ap.professionalProfileId === user.professionalProfileId
    )
    if (!canSeeOthers && existing.professionalProfileId !== user.professionalProfileId && !isParticipant) {
      return forbiddenResponse("Você só pode atualizar seus próprios agendamentos")
    }

    const currentStatus = existing.status as AppointmentStatus
    const targetStatus = newStatus as AppointmentStatus

    // If status is the same, return success without update
    if (currentStatus === targetStatus) {
      return NextResponse.json({
        success: true,
        message: "Status já está atualizado",
        appointment: {
          id: existing.id,
          status: existing.status,
          patientName: existing.patient?.name || existing.title || null,
          professionalName: existing.professionalProfile.user.name,
        },
      })
    }

    // Validate the status transition
    if (!isValidTransition(currentStatus, targetStatus)) {
      const currentLabel = STATUS_LABELS[currentStatus as keyof typeof STATUS_LABELS]
      const targetLabel = STATUS_LABELS[targetStatus as keyof typeof STATUS_LABELS]
      const allowedTransitions = VALID_TRANSITIONS[currentStatus as keyof typeof VALID_TRANSITIONS] || []
      return NextResponse.json(
        {
          error: `Não é possível alterar de "${currentLabel}" para "${targetLabel}"`,
          currentStatus,
          targetStatus,
          allowedTransitions: allowedTransitions.map(s => ({
            value: s,
            label: STATUS_LABELS[s as keyof typeof STATUS_LABELS],
          })),
        },
        { status: 400 }
      )
    }

    // Pre-check: block ACORDADO→FALTA if credit was already consumed by an invoice
    if (currentStatus === AppointmentStatus.CANCELADO_ACORDADO && targetStatus === AppointmentStatus.CANCELADO_FALTA) {
      const unconsumedCredit = await prisma.sessionCredit.findFirst({
        where: {
          originAppointmentId: existing.id,
          consumedByInvoiceId: null,
        },
      })
      if (!unconsumedCredit) {
        // Credit was already consumed — block the transition
        return NextResponse.json(
          { error: "Crédito já foi utilizado em uma fatura. Não é possível alterar para Falta." },
          { status: 400 }
        )
      }
    }

    // Pre-check: block ACORDADO→PROFISSIONAL if credit was already consumed by an invoice
    if (currentStatus === AppointmentStatus.CANCELADO_ACORDADO && targetStatus === AppointmentStatus.CANCELADO_PROFISSIONAL) {
      const unconsumedCredit = await prisma.sessionCredit.findFirst({
        where: {
          originAppointmentId: existing.id,
          consumedByInvoiceId: null,
        },
      })
      if (!unconsumedCredit) {
        return NextResponse.json(
          { error: "Crédito já foi utilizado em uma fatura. Não é possível alterar para cancelado sem cobrança." },
          { status: 400 }
        )
      }
    }

    // Prepare update data with appropriate timestamps
    const now = new Date()
    const updateData = computeStatusUpdateData(targetStatus, now)

    // Update the appointment
    const updatedAppointment = await prisma.appointment.update({
      where: { id: params.id },
      data: updateData,
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

    // Update patient's lastVisitAt when appointment is finalized
    if (shouldUpdateLastVisitAt(targetStatus) && existing.patientId) {
      await prisma.patient.update({
        where: { id: existing.patientId },
        data: { lastVisitAt: existing.scheduledAt },
      })
    }

    // Credit management for ACORDADO/FALTA transitions
    if (targetStatus === AppointmentStatus.CANCELADO_ACORDADO && existing.patientId) {
      // Only create credit if not already generated
      if (!existing.creditGenerated) {
        await prisma.sessionCredit.create({
          data: {
            clinicId: user.clinicId,
            professionalProfileId: existing.professionalProfileId,
            patientId: existing.patientId,
            originAppointmentId: existing.id,
            reason: `Desmarcou - ${new Date(existing.scheduledAt).toLocaleDateString("pt-BR")}`,
          },
        })
        await prisma.appointment.update({
          where: { id: existing.id },
          data: { creditGenerated: true },
        })
      }
    }

    // Switching from ACORDADO to FALTA: delete the unconsumed credit (pre-checked above)
    if (currentStatus === AppointmentStatus.CANCELADO_ACORDADO && targetStatus === AppointmentStatus.CANCELADO_FALTA) {
      const credit = await prisma.sessionCredit.findFirst({
        where: {
          originAppointmentId: existing.id,
          consumedByInvoiceId: null,
        },
      })
      if (credit) {
        await prisma.sessionCredit.delete({ where: { id: credit.id } })
        await prisma.appointment.update({
          where: { id: existing.id },
          data: { creditGenerated: false },
        })
      }
    }

    // Switching from ACORDADO to PROFISSIONAL: delete the unconsumed credit (pre-checked above)
    if (currentStatus === AppointmentStatus.CANCELADO_ACORDADO && targetStatus === AppointmentStatus.CANCELADO_PROFISSIONAL) {
      const credit = await prisma.sessionCredit.findFirst({
        where: {
          originAppointmentId: existing.id,
          consumedByInvoiceId: null,
        },
      })
      if (credit) {
        await prisma.sessionCredit.delete({ where: { id: credit.id } })
        await prisma.appointment.update({
          where: { id: existing.id },
          data: { creditGenerated: false },
        })
      }
    }

    // Switching from FALTA to ACORDADO: create credit
    if (currentStatus === AppointmentStatus.CANCELADO_FALTA && targetStatus === AppointmentStatus.CANCELADO_ACORDADO && existing.patientId) {
      await prisma.sessionCredit.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: existing.professionalProfileId,
          patientId: existing.patientId,
          originAppointmentId: existing.id,
          reason: `Desmarcou - ${new Date(existing.scheduledAt).toLocaleDateString("pt-BR")}`,
        },
      })
      await prisma.appointment.update({
        where: { id: existing.id },
        data: { creditGenerated: true },
      })
    }

    // Switching from PROFISSIONAL to ACORDADO: create credit
    if (currentStatus === AppointmentStatus.CANCELADO_PROFISSIONAL && targetStatus === AppointmentStatus.CANCELADO_ACORDADO && existing.patientId) {
      await prisma.sessionCredit.create({
        data: {
          clinicId: user.clinicId,
          professionalProfileId: existing.professionalProfileId,
          patientId: existing.patientId,
          originAppointmentId: existing.id,
          reason: `Desmarcou - ${new Date(existing.scheduledAt).toLocaleDateString("pt-BR")}`,
        },
      })
      await prisma.appointment.update({
        where: { id: existing.id },
        data: { creditGenerated: true },
      })
    }

    // Create AuditLog entry
    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    const newValuesLog: Record<string, string> = {
      status: targetStatus,
    }
    if (updateData.confirmedAt) {
      newValuesLog.confirmedAt = (updateData.confirmedAt as Date).toISOString()
    }
    if (updateData.cancelledAt) {
      newValuesLog.cancelledAt = (updateData.cancelledAt as Date).toISOString()
    }

    await createAuditLog({
      user,
      action: "APPOINTMENT_STATUS_CHANGED",
      entityType: "Appointment",
      entityId: params.id,
      oldValues: {
        status: currentStatus,
      },
      newValues: newValuesLog,
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      message: `Status alterado para "${STATUS_LABELS[targetStatus]}"`,
      appointment: {
        id: updatedAppointment.id,
        status: updatedAppointment.status,
        confirmedAt: updatedAppointment.confirmedAt?.toISOString() ?? null,
        cancelledAt: updatedAppointment.cancelledAt?.toISOString() ?? null,
        patientName: updatedAppointment.patient?.name || updatedAppointment.title || null,
        professionalName: updatedAppointment.professionalProfile.user.name,
      },
    })
  }
)
