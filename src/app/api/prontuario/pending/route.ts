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

/**
 * GET /api/prontuario/pending — FINALIZADO CONSULTAs of the caller's own
 * professional profile without a note. `?countOnly=true` returns just a count
 * (used by the agenda badge). Supports ?search= (patient name) and ?page=/
 * ?pageSize= for the /prontuario browser. countOnly ignores search/pagination.
 */
export const GET = withFeatureAuth(
  { feature: "prontuario", minAccess: "WRITE" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)
    const countOnly = searchParams.get("countOnly") === "true"

    if (!user.professionalProfileId) {
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
    const profId = user.professionalProfileId

    const appts = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        type: "CONSULTA",
        status: "FINALIZADO",
        patientId: { not: null },
        scheduledAt: { gte: lookbackStart },
        OR: [{ professionalProfileId: profId }, { attendingProfessionalId: profId }],
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
      where: {
        clinicId: user.clinicId,
        appointmentId: { in: appts.map((a) => a.id) },
      },
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
      ownerProfessionalId: profId,
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
