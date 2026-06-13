import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { OwnershipError } from "@/lib/clinic/ownership"
import { isScaleCode } from "@/lib/scales"
import { sendScaleToPatient } from "@/lib/scales/send"
import { getAppBaseUrl } from "@/lib/forms/base-url"
import { loadManageContext, ScaleAccessError } from "../helpers"

const schema = z.object({
  scaleCode: z.string().refine(isScaleCode, "Escala inválida"),
  channel: z.enum(["WHATSAPP", "EMAIL"]),
})

/** POST /api/patients/[id]/escalas/enviar — send a scale link to the patient. */
export const POST = withFeatureAuth(
  { feature: "escalas", minAccess: "WRITE" },
  async (req: NextRequest, { user, access }, params) => {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { scaleCode, channel } = parsed.data

    try {
      const ctx = await loadManageContext(user, access, params.id)

      const consented =
        channel === "EMAIL" ? ctx.consent.email : ctx.consent.whatsapp
      if (!consented) {
        return NextResponse.json(
          { error: "Paciente sem consentimento para este canal de contato." },
          { status: 422 }
        )
      }

      const { administration, link } = await sendScaleToPatient({
        clinicId: user.clinicId,
        patientId: ctx.patientId,
        professionalProfileId: ctx.professionalProfileId,
        scaleCode,
        channel,
        baseUrl: getAppBaseUrl(),
      })

      await audit.log({
        user,
        action: AuditAction.SCALE_SENT,
        entityType: "ScaleAdministration",
        entityId: administration.id,
        newValues: { scaleCode, channel },
        request: req,
      })

      return NextResponse.json({ administration, link }, { status: 201 })
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
      }
      if (e instanceof ScaleAccessError) {
        return NextResponse.json({ error: e.message }, { status: 403 })
      }
      throw e
    }
  }
)
