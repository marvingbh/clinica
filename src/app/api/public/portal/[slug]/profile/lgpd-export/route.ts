import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  withPortalSession,
  readOnlyResponse,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

const schema = z.object({ patientId: z.string().min(1) })

/**
 * POST /api/public/portal/[slug]/profile/lgpd-export
 * Creates an LGPD_EXPORT PortalRequest (one pending per patient → 409 if exists).
 */
export const POST = withPortalSession(
  async (req, ctx) => {
    if (ctx.access === "read_only") return readOnlyResponse()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }
    if (!ctx.patientIds.includes(parsed.data.patientId)) {
      return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 })
    }

    const existing = await prisma.portalRequest.findFirst({
      where: {
        clinicId: ctx.clinic.id,
        patientId: parsed.data.patientId,
        type: "LGPD_EXPORT",
        status: "PENDING",
      },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: "Você já possui uma solicitação de dados em andamento." },
        { status: 409 },
      )
    }

    const request = await prisma.portalRequest.create({
      data: {
        clinicId: ctx.clinic.id,
        patientId: parsed.data.patientId,
        type: "LGPD_EXPORT",
        payload: {},
      },
    })

    const ip = getClientIp(req.headers)
    await prisma.auditLog.create({
      data: {
        clinicId: ctx.clinic.id,
        userId: null,
        action: "PORTAL_LGPD_EXPORT_REQUESTED",
        entityType: "PortalRequest",
        entityId: request.id,
        newValues: { patientId: parsed.data.patientId },
        ipAddress: ip !== "unknown" ? ip : null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    })

    return NextResponse.json({ requestId: request.id })
  },
  { requireScope: "FULL" },
)
