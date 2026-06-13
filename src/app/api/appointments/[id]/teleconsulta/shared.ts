import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac"

/**
 * Shared loader + ownership check for the professional teleconsulta routes.
 * Tenant-scopes by clinicId (404 on miss, never leak existence) and selects
 * exactly the fields the room/state machine needs.
 */
export async function loadTeleconsultaAppointment(id: string, clinicId: string) {
  return prisma.appointment.findFirst({
    where: { id, clinicId },
    select: {
      id: true,
      clinicId: true,
      type: true,
      modality: true,
      status: true,
      scheduledAt: true,
      endAt: true,
      groupId: true,
      sessionGroupId: true,
      meetingUrl: true,
      telehealthStartedAt: true,
      professionalProfileId: true,
      clinic: { select: { telehealthEnabled: true } },
      professionalProfile: { select: { user: { select: { name: true } } } },
      additionalProfessionals: { select: { professionalProfileId: true } },
    },
  })
}

export type TeleconsultaAppointment = NonNullable<
  Awaited<ReturnType<typeof loadTeleconsultaAppointment>>
>

/**
 * The user may manage this session's room when they are the titular
 * professional, a listed additional professional, or hold agenda_others.
 */
export function canManageTeleconsulta(
  appointment: TeleconsultaAppointment,
  user: AuthUser,
  hasAgendaOthers: boolean
): boolean {
  if (hasAgendaOthers) return true
  const pid = user.professionalProfileId
  if (!pid) return false
  if (appointment.professionalProfileId === pid) return true
  return appointment.additionalProfessionals.some((ap) => ap.professionalProfileId === pid)
}
