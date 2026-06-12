import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { summarizePortalRequest } from "@/lib/patient-portal"

const PAGE_SIZE = 30

/**
 * Builds the patient-scoping clause for a PROFESSIONAL: only requests for
 * patients they reference or have/had appointments with. ADMIN sees all.
 */
function patientScopeWhere(
  role: string,
  professionalProfileId: string | null,
): Prisma.PortalRequestWhereInput {
  if (role === "ADMIN" || !professionalProfileId) return {}
  return {
    patient: {
      OR: [
        { referenceProfessionalId: professionalProfileId },
        { appointments: { some: { professionalProfileId } } },
      ],
    },
  }
}

/**
 * GET /api/portal-requests?status=&page=
 * Lists PortalRequests for the caller's clinic. PROFESSIONAL is scoped to own.
 */
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (req, { user }) => {
    const url = new URL(req.url)
    const statusParam = url.searchParams.get("status")
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)

    const where: Prisma.PortalRequestWhereInput = {
      clinicId: user.clinicId,
      ...(statusParam === "PENDING" || statusParam === "RESOLVED" || statusParam === "REJECTED"
        ? { status: statusParam }
        : {}),
      ...patientScopeWhere(user.role, user.professionalProfileId),
    }

    const [requests, total] = await Promise.all([
      prisma.portalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          type: true,
          status: true,
          payload: true,
          createdAt: true,
          resolvedAt: true,
          resolutionNotes: true,
          patient: { select: { id: true, name: true } },
          appointment: { select: { scheduledAt: true } },
        },
      }),
      prisma.portalRequest.count({ where }),
    ])

    return NextResponse.json({
      requests: requests.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        summary: summarizePortalRequest({ type: r.type, payload: r.payload }),
        payload: r.payload,
        patientName: r.patient.name,
        patientId: r.patient.id,
        appointmentAt: r.appointment?.scheduledAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolutionNotes: r.resolutionNotes,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    })
  },
)
