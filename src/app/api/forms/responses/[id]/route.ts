import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { parseFieldsSafe, effectiveStatus, canAccessResponseContent } from "@/lib/forms"

/**
 * GET /api/forms/responses/[id] — full response (fields + answers).
 * Content (answers) is restricted to ADMIN, the patient's reference
 * professional, or the user who sent the form (see canAccessResponseContent).
 */
export const GET = withFeatureAuth(
  { feature: "forms", minAccess: "READ" },
  async (_req: NextRequest, { user }, params) => {
    const response = await prisma.formResponse.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        formVersion: { select: { version: true, fields: true, template: { select: { name: true } } } },
        patient: { select: { id: true, name: true, referenceProfessionalId: true } },
      },
    })
    if (!response) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })

    const allowed = canAccessResponseContent({
      role: user.role,
      userProfessionalProfileId: user.professionalProfileId,
      patientReferenceProfessionalId: response.patient.referenceProfessionalId,
      responseProfessionalProfileId: response.professionalProfileId,
      responseSentByUserId: response.sentByUserId,
      userId: user.id,
    })
    if (!allowed) {
      return NextResponse.json(
        { error: "Sem permissão para ver o conteúdo desta resposta" },
        { status: 403 }
      )
    }

    return NextResponse.json({
      response: {
        id: response.id,
        templateName: response.formVersion.template.name,
        version: response.formVersion.version,
        status: effectiveStatus(response, new Date()),
        sentVia: response.sentVia,
        sentAt: response.sentAt,
        expiresAt: response.expiresAt,
        completedAt: response.completedAt,
      },
      fields: parseFieldsSafe(response.formVersion.fields),
      answers: response.answers,
      patient: { id: response.patient.id, name: response.patient.name },
    })
  }
)
