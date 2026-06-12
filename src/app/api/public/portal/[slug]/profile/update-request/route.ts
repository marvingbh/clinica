import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  buildUpdateRequestPayload,
  toPortalPatient,
  UPDATABLE_PROFILE_FIELDS,
} from "@/lib/patient-portal"
import {
  withPortalSession,
  readOnlyResponse,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

const changesSchema = z.record(z.string(), z.string().max(255).nullable())

const schema = z.object({
  patientId: z.string().min(1),
  changes: changesSchema,
})

/**
 * POST /api/public/portal/[slug]/profile/update-request
 * Creates an UPDATE_DATA PortalRequest with a validated diff (no direct write).
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

    const patient = await prisma.patient.findFirst({
      where: { id: parsed.data.patientId, clinicId: ctx.clinic.id },
      select: {
        id: true,
        name: true,
        birthDate: true,
        phone: true,
        email: true,
        addressStreet: true,
        addressNumber: true,
        addressNeighborhood: true,
        addressCity: true,
        addressState: true,
        addressZip: true,
        consentWhatsApp: true,
        consentEmail: true,
      },
    })
    if (!patient) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 })

    // Keep only allow-listed keys before diffing.
    const requested: Record<string, string | null> = {}
    for (const field of UPDATABLE_PROFILE_FIELDS) {
      if (field in parsed.data.changes) requested[field] = parsed.data.changes[field]
    }

    const changes = buildUpdateRequestPayload(toPortalPatient(patient), requested)
    if (changes.length === 0) {
      return NextResponse.json({ error: "Nenhuma alteração informada." }, { status: 400 })
    }

    const request = await prisma.portalRequest.create({
      data: {
        clinicId: ctx.clinic.id,
        patientId: patient.id,
        type: "UPDATE_DATA",
        payload: { changes } as unknown as Prisma.InputJsonValue,
      },
    })

    const ip = getClientIp(req.headers)
    await prisma.auditLog.create({
      data: {
        clinicId: ctx.clinic.id,
        userId: null,
        action: "PORTAL_UPDATE_REQUESTED",
        entityType: "PortalRequest",
        entityId: request.id,
        newValues: { patientId: patient.id, fields: changes.map((c) => c.field) },
        ipAddress: ip !== "unknown" ? ip : null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    })

    return NextResponse.json({ requestId: request.id })
  },
  { requireScope: "FULL" },
)
