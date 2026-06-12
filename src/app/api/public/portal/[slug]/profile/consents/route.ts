import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  withPortalSession,
  readOnlyResponse,
} from "@/lib/patient-portal/with-portal-session"
import { getClientIp } from "@/lib/patient-portal/portal-cookies"

const schema = z.object({
  patientId: z.string().min(1),
  consentWhatsApp: z.boolean().optional(),
  consentEmail: z.boolean().optional(),
})

/**
 * POST /api/public/portal/[slug]/profile/consents
 * Self-service channel consent toggles (direct write + timestamps + audit).
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

    const now = new Date()
    const data: Record<string, unknown> = {}
    if (parsed.data.consentWhatsApp !== undefined) {
      data.consentWhatsApp = parsed.data.consentWhatsApp
      data.consentWhatsAppAt = parsed.data.consentWhatsApp ? now : null
    }
    if (parsed.data.consentEmail !== undefined) {
      data.consentEmail = parsed.data.consentEmail
      data.consentEmailAt = parsed.data.consentEmail ? now : null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nenhuma alteração informada." }, { status: 400 })
    }

    // Scoped update (clinicId + accessible patient).
    const result = await prisma.patient.updateMany({
      where: { id: parsed.data.patientId, clinicId: ctx.clinic.id },
      data,
    })
    if (result.count === 0) {
      return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 })
    }

    const ip = getClientIp(req.headers)
    await prisma.auditLog.create({
      data: {
        clinicId: ctx.clinic.id,
        userId: null,
        action: "PORTAL_CONSENT_CHANGED",
        entityType: "Patient",
        entityId: parsed.data.patientId,
        newValues: {
          patientId: parsed.data.patientId,
          consentWhatsApp: parsed.data.consentWhatsApp,
          consentEmail: parsed.data.consentEmail,
        },
        ipAddress: ip !== "unknown" ? ip : null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    })

    return NextResponse.json({ ok: true })
  },
  { requireScope: "FULL" },
)
