import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { audit, AuditAction } from "@/lib/rbac"
import { assertPatientInClinic, assertProfessionalInClinic, OwnershipError } from "@/lib/clinic/ownership"
import { effectiveStatus, sendFormToPatient, SendFormError } from "@/lib/forms"
import { getAppBaseUrl } from "@/lib/forms/base-url"

const sendSchema = z.object({
  templateId: z.string().min(1),
  patientId: z.string().min(1),
  sentVia: z.enum(["WHATSAPP", "EMAIL", "LINK"]),
  expiresInDays: z.number().int().positive().max(365).optional(),
})

/** GET /api/forms/responses?patientId= — metadata-only list for a patient. */
export const GET = withFeatureAuth(
  { feature: "forms", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const patientId = new URL(req.url).searchParams.get("patientId")
    if (!patientId) return NextResponse.json({ error: "patientId é obrigatório" }, { status: 400 })

    try {
      await assertPatientInClinic(user.clinicId, patientId)
    } catch (e) {
      if (e instanceof OwnershipError) return NextResponse.json({ error: "Paciente não encontrado" }, { status: 404 })
      throw e
    }

    const responses = await prisma.formResponse.findMany({
      where: { clinicId: user.clinicId, patientId },
      orderBy: { sentAt: "desc" },
      include: {
        formVersion: { select: { version: true, template: { select: { name: true } } } },
        professionalProfile: { select: { user: { select: { name: true } } } },
      },
    })

    const now = new Date()
    return NextResponse.json({
      responses: responses.map((r) => ({
        id: r.id,
        templateName: r.formVersion.template.name,
        version: r.formVersion.version,
        status: effectiveStatus(r, now),
        sentVia: r.sentVia,
        sentAt: r.sentAt,
        expiresAt: r.expiresAt,
        completedAt: r.completedAt,
        professionalName: r.professionalProfile?.user.name ?? null,
      })),
    })
  }
)

/** POST /api/forms/responses — send a form to a patient. */
export const POST = withFeatureAuth(
  { feature: "forms", minAccess: "WRITE" },
  async (req: NextRequest, { user }) => {
    const parsed = sendSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { templateId, patientId, sentVia, expiresInDays } = parsed.data

    try {
      await assertPatientInClinic(user.clinicId, patientId)

      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: user.clinicId },
        select: { referenceProfessionalId: true },
      })
      const professionalProfileId =
        patient?.referenceProfessionalId ?? user.professionalProfileId ?? null
      if (professionalProfileId) await assertProfessionalInClinic(user.clinicId, professionalProfileId)

      const { response, formUrl } = await sendFormToPatient({
        clinicId: user.clinicId,
        templateId,
        patientId,
        sentByUserId: user.id,
        professionalProfileId,
        sentVia,
        expiresInDays,
        baseUrl: getAppBaseUrl(),
      })

      await audit.log({
        user,
        action: AuditAction.FORM_SENT,
        entityType: "FormResponse",
        entityId: response.id,
        newValues: { templateId, patientId, sentVia },
        request: req,
      })

      return NextResponse.json({ response, formUrl }, { status: 201 })
    } catch (e) {
      if (e instanceof OwnershipError) {
        return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
      }
      if (e instanceof SendFormError) {
        const status = e.code === "NO_PUBLISHED_VERSION" ? 400 : 404
        return NextResponse.json({ error: e.message }, { status })
      }
      throw e
    }
  }
)
