import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { toPortalAppointment } from "@/lib/patient-portal"
import { withPortalSession } from "@/lib/patient-portal/with-portal-session"

const PAGE_SIZE = 20

/**
 * GET /api/public/portal/[slug]/appointments?patientId=&range=upcoming|past&page=
 * Only CONSULTA appointments for a validated patient profile.
 */
export const GET = withPortalSession(async (req, ctx) => {
  const url = new URL(req.url)
  const patientId = url.searchParams.get("patientId") ?? ""
  const range = url.searchParams.get("range") === "past" ? "past" : "upcoming"
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)

  if (!ctx.patientIds.includes(patientId)) {
    return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 })
  }

  const now = new Date()
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinic.id,
      patientId,
      type: "CONSULTA",
      scheduledAt: range === "upcoming" ? { gte: now } : { lt: now },
    },
    orderBy: { scheduledAt: range === "upcoming" ? "asc" : "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      scheduledAt: true,
      endAt: true,
      status: true,
      modality: true,
      professionalProfile: { select: { user: { select: { name: true } } } },
    },
  })

  return NextResponse.json({ appointments: appointments.map(toPortalAppointment) })
})
