import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import {
  filterPendingAppointments,
  normalizeSearch,
  parsePageParams,
  paginateArray,
  paginationMeta,
  type PendingAppointment,
} from "@/lib/prontuario"

const LOOKBACK_DAYS = 30

function parseDay(v: string | null, end: boolean): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T${end ? "23:59:59.999" : "00:00:00.000"}Z`)
  return isNaN(d.getTime()) ? null : d
}

/**
 * GET /api/prontuario/pending — FINALIZADO CONSULTAs without a note.
 * Scope: an authoring professional sees only their own; a director (READ-only,
 * or an admin without a professional profile) may browse any professional,
 * optionally narrowed by ?professionalProfileId (none = clinic-wide).
 * Filters: ?search= (patient name), ?from=&to= (YYYY-MM-DD, on session date).
 * `?countOnly=true` returns just a count (agenda badge); pagination via ?page=/?pageSize=.
 */
export const GET = withFeatureAuth(
  { feature: "prontuario", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const countOnly = searchParams.get("countOnly") === "true"

    // Admin (no professional profile) may browse/select any professional; a
    // treating professional (has a profile) always sees only their own pendings.
    const isDirector = user.professionalProfileId === null
    const requestedProf = searchParams.get("professionalProfileId")
    const scopedProf = isDirector ? requestedProf || null : user.professionalProfileId

    // A non-director author without a profile can't own notes → nothing pending.
    if (!isDirector && !scopedProf) {
      return countOnly
        ? NextResponse.json({ count: 0 })
        : NextResponse.json({ pending: [], total: 0, page: 1, pageSize: 0, totalPages: 0 })
    }

    const search = countOnly ? null : normalizeSearch(searchParams.get("search"))
    const { page, pageSize } = parsePageParams({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    })
    const now = new Date()
    const lookbackStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const fromDate = parseDay(searchParams.get("from"), false)
    const toDate = parseDay(searchParams.get("to"), true)
    const gte = fromDate && fromDate > lookbackStart ? fromDate : lookbackStart

    const appts = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        type: "CONSULTA",
        status: "FINALIZADO",
        patientId: { not: null },
        scheduledAt: { gte, ...(toDate ? { lte: toDate } : {}) },
        ...(scopedProf
          ? { OR: [{ professionalProfileId: scopedProf }, { attendingProfessionalId: scopedProf }] }
          : {}),
        ...(search ? { patient: { name: { contains: search, mode: "insensitive" } } } : {}),
      },
      select: {
        id: true,
        patientId: true,
        scheduledAt: true,
        status: true,
        type: true,
        professionalProfileId: true,
        attendingProfessionalId: true,
        patient: { select: { name: true } },
      },
      orderBy: { scheduledAt: "desc" },
    })

    const existingNotes = await prisma.clinicalNote.findMany({
      where: { clinicId: user.clinicId, appointmentId: { in: appts.map((a) => a.id) } },
      select: { appointmentId: true },
    })
    const existingApptIds = new Set(
      existingNotes.map((n) => n.appointmentId).filter((id): id is string => id !== null)
    )

    const pendingInput: PendingAppointment[] = appts.map((a) => ({
      id: a.id,
      patientId: a.patientId,
      patientName: a.patient?.name ?? null,
      scheduledAt: a.scheduledAt,
      status: a.status,
      type: a.type,
      professionalProfileId: a.professionalProfileId,
      attendingProfessionalId: a.attendingProfessionalId,
    }))

    const pending = filterPendingAppointments(pendingInput, existingApptIds, now, {
      lookbackDays: LOOKBACK_DAYS,
      ...(scopedProf ? { ownerProfessionalId: scopedProf } : {}),
    })

    if (countOnly) return NextResponse.json({ count: pending.length })

    return NextResponse.json({
      pending: paginateArray(pending, page, pageSize).map((p) => ({
        appointmentId: p.id,
        patientId: p.patientId,
        patientName: p.patientName,
        scheduledAt: p.scheduledAt,
      })),
      ...paginationMeta(pending.length, page, pageSize),
    })
  }
)
