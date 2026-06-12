import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  parsePreferences,
  rankCandidates,
  toLocalSlot,
  formatPreferencesSummary,
  type MatchableEntry,
  type OpenSlot,
} from "@/lib/waitlist"
import { professionalBelongsToClinic } from "@/lib/clinic/ownership"

/**
 * GET /api/waitlist/matches?professionalProfileId=&start=&end=&modality=
 * Returns ranked candidates for an open slot (for the SlotMatchesDialog).
 */
export const GET = withFeatureAuth(
  { feature: "waitlist", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const professionalProfileId = searchParams.get("professionalProfileId")
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const modalityParam = searchParams.get("modality")

    if (!professionalProfileId || !start || !end) {
      return NextResponse.json({ error: "Parametros incompletos" }, { status: 400 })
    }
    if (!(await professionalBelongsToClinic(professionalProfileId, user.clinicId))) {
      return NextResponse.json({ error: "Profissional nao encontrado" }, { status: 404 })
    }

    const scheduledAt = new Date(start)
    const endAt = new Date(end)
    if (Number.isNaN(scheduledAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json({ error: "Datas invalidas" }, { status: 400 })
    }
    const modality =
      modalityParam === "ONLINE" || modalityParam === "PRESENCIAL" ? modalityParam : null

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { timezone: true },
    })
    const timezone = clinic?.timezone || "America/Sao_Paulo"

    const entryRows = await prisma.waitlistEntry.findMany({
      where: {
        clinicId: user.clinicId,
        status: "ATIVA",
        OR: [{ patientId: null }, { patient: { isActive: true } }],
      },
      select: {
        id: true,
        patientId: true,
        professionalProfileId: true,
        preferences: true,
        priority: true,
        priorityNote: true,
        leadName: true,
        leadPhone: true,
        createdAt: true,
        patient: { select: { name: true, phone: true } },
      },
    })

    const entries: MatchableEntry[] = entryRows.map((e) => ({
      id: e.id,
      patientId: e.patientId,
      professionalProfileId: e.professionalProfileId,
      preferences: parsePreferences(e.preferences),
      priority: e.priority,
      createdAt: e.createdAt,
    }))

    const slot: OpenSlot = {
      professionalProfileId,
      scheduledAt,
      endAt,
      modality,
      sourceAppointmentId: null,
    }

    // Same-day appointments for the badge.
    const dayISO = scheduledAt.toLocaleDateString("en-CA", { timeZone: timezone })
    const dayStart = new Date(`${dayISO}T00:00:00.000Z`)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const sameDayRows = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId: { not: null },
        scheduledAt: { gte: dayStart, lt: dayEnd },
        status: { in: ["AGENDADO", "CONFIRMADO", "FINALIZADO"] },
      },
      select: { patientId: true },
    })
    const sameDayPatientIds = new Set(
      sameDayRows.map((r) => r.patientId).filter((id): id is string => id !== null)
    )

    const ranked = rankCandidates({
      slot,
      local: toLocalSlot(slot, timezone),
      entries,
      sameDayPatientIds,
    })

    const rowById = new Map(entryRows.map((e) => [e.id, e]))
    const candidates = ranked.map((c) => {
      const row = rowById.get(c.entry.id)!
      return {
        entryId: c.entry.id,
        patientId: c.entry.patientId,
        name: row.patient?.name ?? row.leadName ?? "—",
        phone: row.patient?.phone ?? row.leadPhone ?? null,
        isLead: c.entry.patientId === null,
        professionalMatch: c.professionalMatch,
        hasSameDayAppointment: c.hasSameDayAppointment,
        priorityNote: row.priorityNote,
        preferencesSummary: formatPreferencesSummary(c.entry.preferences),
      }
    })

    return NextResponse.json({ candidates })
  }
)
