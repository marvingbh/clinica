import { prisma } from "@/lib/prisma"
import type { ReportScope } from "./fetch-shared"
import { CANCEL_STATUSES } from "./types"
import { computeRetention, type RetentionResult } from "./retention"

interface ApptRow {
  patientId: string | null
  scheduledAt: Date
  professionalProfileId: string
  attendingProfessionalId: string | null
}

function attributedProf(a: ApptRow): string {
  return a.attendingProfessionalId ?? a.professionalProfileId
}

export interface DroppedPatient {
  patientId: string
  name: string
  lastSessionAt: string | null
  referenceProfessionalName: string | null
}

export interface RetentionPayload extends RetentionResult {
  dropped_list: DroppedPatient[]
}

/**
 * Retention over the full FINALIZADO CONSULTA history of the clinic (own-scope
 * filters by the attributed professional). The dropped list applies the same
 * scope so own-scope never leaks colleagues' patients.
 */
export async function fetchRetention(scope: ReportScope, now: Date): Promise<RetentionPayload> {
  const { clinicId, professionalProfileId, range } = scope

  const finalized = await prisma.appointment.findMany({
    where: { clinicId, type: "CONSULTA", status: "FINALIZADO", patientId: { not: null } },
    select: {
      patientId: true,
      scheduledAt: true,
      professionalProfileId: true,
      attendingProfessionalId: true,
    },
  })

  const scoped = professionalProfileId
    ? finalized.filter((a) => attributedProf(a) === professionalProfileId)
    : finalized

  const allFinalizadoSessions = scoped.map((a) => ({ patientId: a.patientId!, scheduledAt: a.scheduledAt }))

  // Patients with a future (non-cancelled) CONSULTA — same scope.
  const future = await prisma.appointment.findMany({
    where: {
      clinicId,
      type: "CONSULTA",
      status: { notIn: [...CANCEL_STATUSES] },
      patientId: { not: null },
      scheduledAt: { gt: now },
      ...(professionalProfileId
        ? { OR: [{ professionalProfileId }, { attendingProfessionalId: professionalProfileId }] }
        : {}),
    },
    select: { patientId: true },
  })
  const futureBookedPatientIds = new Set(future.map((a) => a.patientId!))

  const result = computeRetention({ allFinalizadoSessions, futureBookedPatientIds, range, now })

  // Last finalized session per dropped patient (within scope).
  const lastByPatient = new Map<string, Date>()
  for (const s of allFinalizadoSessions) {
    const prev = lastByPatient.get(s.patientId)
    if (!prev || s.scheduledAt > prev) lastByPatient.set(s.patientId, s.scheduledAt)
  }

  let dropped_list: DroppedPatient[] = []
  if (result.droppedPatientIds.length > 0) {
    const patients = await prisma.patient.findMany({
      where: { clinicId, id: { in: result.droppedPatientIds } },
      select: {
        id: true,
        name: true,
        referenceProfessional: { select: { user: { select: { name: true } } } },
      },
    })
    dropped_list = patients
      .map((p) => ({
        patientId: p.id,
        name: p.name,
        lastSessionAt: lastByPatient.get(p.id)?.toISOString() ?? null,
        referenceProfessionalName: p.referenceProfessional?.user.name ?? null,
      }))
      .sort((a, b) => (a.lastSessionAt ?? "").localeCompare(b.lastSessionAt ?? ""))
  }

  return { ...result, dropped_list }
}
