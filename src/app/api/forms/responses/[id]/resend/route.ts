import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { type FormSentVia } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { generateFormToken, buildFormUrl, computeFormExpiry, dispatchFormRequest } from "@/lib/forms"
import { getAppBaseUrl } from "@/lib/forms/base-url"

const resendSchema = z.object({
  sentVia: z.enum(["WHATSAPP", "EMAIL", "LINK"]).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
})

/**
 * POST /api/forms/responses/[id]/resend — regenerate the token, extend the
 * expiry and reset a pending/expired response to ENVIADO (the old link dies).
 */
export const POST = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const response = await prisma.formResponse.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        formVersion: { select: { template: { select: { name: true } } } },
        patient: { select: { name: true, email: true, phone: true } },
      },
    })
    if (!response) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
    if (response.status === "CONCLUIDO") {
      return NextResponse.json({ error: "Formulário já enviado" }, { status: 409 })
    }

    const parsed = resendSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const sentVia: FormSentVia = parsed.data.sentVia ?? response.sentVia
    const now = new Date()
    const { token, tokenHash } = generateFormToken()
    const expiresAt = computeFormExpiry(now, parsed.data.expiresInDays)

    await prisma.formResponse.update({
      where: { id: response.id },
      data: { tokenHash, expiresAt, status: "ENVIADO", sentVia, sentAt: now, startedAt: null },
    })

    const formUrl = buildFormUrl(getAppBaseUrl(), token)

    if (sentVia !== "LINK") {
      await dispatchFormRequest({
        clinicId: user.clinicId,
        sentVia,
        patient: response.patient,
        formName: response.formVersion.template.name,
        formUrl,
        expiresAt,
      })
    }

    await audit.log({
      user,
      action: AuditAction.FORM_RESEND,
      entityType: "FormResponse",
      entityId: response.id,
      newValues: { sentVia },
      request: req,
    })

    return NextResponse.json({ formUrl })
  }
)
