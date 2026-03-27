import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { meetsMinAccess, type AuthUser } from "@/lib/rbac"
import { createAuditLog } from "@/lib/rbac/audit"
import {
  filterCancellableAppointments,
  buildBulkCancelSummary,
  validateDateRange,
  validateReason,
  normalizeDateRange,
  findRecurrencesToDeactivate,
  type BulkCancelAppointment,
} from "@/lib/appointments/bulk-cancel"

/**
 * POST /api/appointments/bulk-cancel
 *
 * Two modes:
 * - preview: Returns matching appointments and summary
 * - execute: Cancels the specified appointment IDs
 */
export const POST = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const canManageOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 })
    }

    const mode = body.mode as string
    if (mode !== "preview" && mode !== "execute") {
      return NextResponse.json({ error: "Modo invalido. Use 'preview' ou 'execute'" }, { status: 400 })
    }

    if (mode === "preview") {
      return handlePreview(body, user, canManageOthers)
    }

    return handleExecute(body, user, canManageOthers, req)
  }
)

async function handlePreview(
  body: Record<string, unknown>,
  user: AuthUser,
  canManageOthers: boolean
) {
  const startDate = body.startDate as string
  const endDate = body.endDate as string
  const professionalProfileId = body.professionalProfileId as string | undefined

  const dateValidation = validateDateRange(startDate, endDate)
  if (!dateValidation.valid) {
    return NextResponse.json({ error: dateValidation.error }, { status: 400 })
  }

  const [normStart, normEnd] = normalizeDateRange(startDate, endDate)
  const profFilter = resolveProfessionalFilter(user, professionalProfileId, canManageOthers)
  if (profFilter.error) {
    return forbiddenResponse(profFilter.error)
  }

  const appointments = await queryAppointments(user.clinicId, normStart, normEnd, profFilter.id)
  const cancellable = filterCancellableAppointments(appointments)
  const summary = buildBulkCancelSummary(cancellable)

  return NextResponse.json({
    appointments: cancellable.map((apt) => ({
      id: apt.id,
      scheduledAt: apt.scheduledAt.toISOString(),
      type: apt.type,
      status: apt.status,
      patient: apt.patient,
      professionalName: apt.professionalName,
    })),
    summary,
  })
}

async function handleExecute(
  body: Record<string, unknown>,
  user: AuthUser,
  canManageOthers: boolean,
  req: Request
) {
  const appointmentIds = body.appointmentIds as string[] | undefined
  const reason = body.reason as string | undefined

  if (!appointmentIds || !Array.isArray(appointmentIds) || appointmentIds.length === 0) {
    return NextResponse.json({ error: "Lista de agendamentos e obrigatoria" }, { status: 400 })
  }

  if (!reason) {
    return NextResponse.json({ error: "Motivo e obrigatorio" }, { status: 400 })
  }

  const reasonValidation = validateReason(reason)
  if (!reasonValidation.valid) {
    return NextResponse.json({ error: reasonValidation.error }, { status: 400 })
  }

  // Fetch the appointments to validate they exist and belong to this clinic
  const appointments = await prisma.appointment.findMany({
    where: {
      id: { in: appointmentIds },
      clinicId: user.clinicId,
      status: { in: ["AGENDADO", "CONFIRMADO"] },
      type: { in: ["CONSULTA", "REUNIAO"] },
    },
    select: {
      id: true,
      status: true,
      professionalProfileId: true,
      recurrenceId: true,
      additionalProfessionals: { select: { professionalProfileId: true } },
    },
  })

  // Ownership check for non-admin users
  if (!canManageOthers && user.professionalProfileId) {
    const hasUnowned = appointments.some((apt) => {
      const isOwner = apt.professionalProfileId === user.professionalProfileId
      const isParticipant = apt.additionalProfessionals.some(
        (ap) => ap.professionalProfileId === user.professionalProfileId
      )
      return !isOwner && !isParticipant
    })
    if (hasUnowned) {
      return forbiddenResponse("Voce so pode cancelar seus proprios agendamentos")
    }
  }

  if (appointments.length === 0) {
    return NextResponse.json({ error: "Nenhum agendamento valido encontrado" }, { status: 400 })
  }

  const validIds = appointments.map((a) => a.id)
  const cancellationReason = reason.trim()
  const now = new Date()

  // Check recurrences that should be deactivated
  const recurrenceIds = [
    ...new Set(appointments.filter((a) => a.recurrenceId).map((a) => a.recurrenceId!)),
  ]

  let recurrencesToDeactivate: string[] = []
  if (recurrenceIds.length > 0) {
    const allRecurrenceApts = await prisma.appointment.findMany({
      where: {
        recurrenceId: { in: recurrenceIds },
        clinicId: user.clinicId,
      },
      select: { id: true, recurrenceId: true, status: true },
    })
    recurrencesToDeactivate = findRecurrencesToDeactivate(
      new Set(validIds),
      allRecurrenceApts.map((a) => ({
        id: a.id,
        recurrenceId: a.recurrenceId!,
        status: a.status,
      }))
    )
  }

  // Execute in transaction
  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: { id: { in: validIds } },
      data: {
        status: "CANCELADO_PROFISSIONAL",
        cancellationReason,
        cancelledAt: now,
      },
    })

    if (recurrencesToDeactivate.length > 0) {
      await tx.appointmentRecurrence.updateMany({
        where: { id: { in: recurrencesToDeactivate } },
        data: { isActive: false },
      })
    }
  })

  // Audit logs (per-appointment, outside transaction)
  const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
  const userAgent = req.headers.get("user-agent") ?? undefined

  await Promise.all(
    appointments.map((apt) =>
      createAuditLog({
        user,
        action: "BULK_CANCELLATION",
        entityType: "Appointment",
        entityId: apt.id,
        oldValues: { status: apt.status },
        newValues: {
          status: "CANCELADO_PROFISSIONAL",
          cancellationReason,
          cancelledAt: now.toISOString(),
          bulkCancelCount: validIds.length,
        },
        ipAddress,
        userAgent,
      })
    )
  )

  return NextResponse.json({
    success: true,
    cancelledCount: validIds.length,
    cancelledIds: validIds,
    deactivatedRecurrences: recurrencesToDeactivate.length,
  })
}

function resolveProfessionalFilter(
  user: Pick<AuthUser, "professionalProfileId">,
  requestedProfId: string | undefined,
  canManageOthers: boolean
): { id: string | undefined; error?: string } {
  // "all" or empty = all professionals (admin only)
  if (!requestedProfId || requestedProfId === "all") {
    if (!canManageOthers) {
      // Non-admin: scope to own
      return { id: user.professionalProfileId ?? undefined }
    }
    return { id: undefined } // all professionals
  }

  // Specific professional requested
  if (!canManageOthers && requestedProfId !== user.professionalProfileId) {
    return { id: undefined, error: "Voce so pode cancelar seus proprios agendamentos" }
  }

  return { id: requestedProfId }
}

async function queryAppointments(
  clinicId: string,
  startDate: string,
  endDate: string,
  professionalProfileId: string | undefined
): Promise<BulkCancelAppointment[]> {
  const dayStart = new Date(startDate + "T00:00:00.000Z")
  const dayEnd = new Date(endDate + "T23:59:59.999Z")

  const where: Record<string, unknown> = {
    clinicId,
    scheduledAt: { gte: dayStart, lte: dayEnd },
    status: { in: ["AGENDADO", "CONFIRMADO"] },
    type: { in: ["CONSULTA", "REUNIAO"] },
  }

  if (professionalProfileId) {
    where.professionalProfileId = professionalProfileId
  }

  const raw = await prisma.appointment.findMany({
    where,
    select: {
      id: true,
      status: true,
      type: true,
      scheduledAt: true,
      recurrenceId: true,
      patientId: true,
      professionalProfileId: true,
      patient: { select: { id: true, name: true } },
      professionalProfile: { include: { user: { select: { name: true } } } },
    },
    orderBy: { scheduledAt: "asc" },
  })

  return raw.map((a) => ({
    id: a.id,
    status: a.status,
    type: a.type,
    scheduledAt: a.scheduledAt,
    recurrenceId: a.recurrenceId,
    patientId: a.patientId,
    professionalProfileId: a.professionalProfileId,
    patient: a.patient,
    professionalName: a.professionalProfile.user.name,
  }))
}
