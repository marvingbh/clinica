import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { createAuditLog } from "@/lib/rbac/audit"
import { AppointmentStatus } from "@prisma/client"

/**
 * Valid status transitions for appointments.
 * Maps from current status to allowed next statuses.
 */
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  AGENDADO: [
    AppointmentStatus.CONFIRMADO,
    AppointmentStatus.FINALIZADO,
    AppointmentStatus.NAO_COMPARECEU,
    AppointmentStatus.CANCELADO_PROFISSIONAL,
    AppointmentStatus.CANCELADO_PACIENTE,
  ],
  CONFIRMADO: [
    AppointmentStatus.FINALIZADO,
    AppointmentStatus.NAO_COMPARECEU,
    AppointmentStatus.CANCELADO_PROFISSIONAL,
    AppointmentStatus.CANCELADO_PACIENTE,
  ],
  // Terminal states - no transitions allowed (use explicit override if needed)
  FINALIZADO: [],
  NAO_COMPARECEU: [],
  CANCELADO_PROFISSIONAL: [],
  CANCELADO_PACIENTE: [],
}

/**
 * Status labels in Portuguese for error messages
 */
const STATUS_LABELS: Record<AppointmentStatus, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  FINALIZADO: "Finalizado",
  NAO_COMPARECEU: "Não compareceu",
  CANCELADO_PROFISSIONAL: "Cancelado (Profissional)",
  CANCELADO_PACIENTE: "Cancelado (Paciente)",
}

/**
 * PATCH /api/appointments/:id/status
 * Update appointment status with transition validation
 *
 * Request body: { status: AppointmentStatus }
 *
 * Allowed transitions:
 * - AGENDADO → CONFIRMADO, FINALIZADO, NAO_COMPARECEU, CANCELADO_*
 * - CONFIRMADO → FINALIZADO, NAO_COMPARECEU, CANCELADO_*
 * - Terminal states (FINALIZADO, NAO_COMPARECEU, CANCELADO_*) → no transitions
 *
 * Note: For cancellations with reason and notifications, use POST /api/appointments/:id/cancel instead.
 */
export const PATCH = withAuth(
  {
    resource: "appointment",
    action: "update",
    getResourceOwnerId: (_req, params) => params?.id,
  },
  async (req, { user, scope }, params) => {
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

    // Check ownership for "own" scope (includes additional professionals)
    const isParticipant = existing.additionalProfessionals.some(
      ap => ap.professionalProfileId === user.professionalProfileId
    )
    if (scope === "own" && existing.professionalProfileId !== user.professionalProfileId && !isParticipant) {
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
    const allowedTransitions = VALID_TRANSITIONS[currentStatus]
    if (!allowedTransitions.includes(targetStatus)) {
      const currentLabel = STATUS_LABELS[currentStatus]
      const targetLabel = STATUS_LABELS[targetStatus]
      return NextResponse.json(
        {
          error: `Não é possível alterar de "${currentLabel}" para "${targetLabel}"`,
          currentStatus,
          targetStatus,
          allowedTransitions: allowedTransitions.map(s => ({
            value: s,
            label: STATUS_LABELS[s],
          })),
        },
        { status: 400 }
      )
    }

    // Prepare update data with appropriate timestamps
    const now = new Date()
    const updateData: Record<string, unknown> = { status: targetStatus }

    // Set timestamps based on target status
    if (targetStatus === AppointmentStatus.CONFIRMADO) {
      updateData.confirmedAt = now
    } else if (
      targetStatus === AppointmentStatus.CANCELADO_PROFISSIONAL ||
      targetStatus === AppointmentStatus.CANCELADO_PACIENTE
    ) {
      updateData.cancelledAt = now
    }

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
