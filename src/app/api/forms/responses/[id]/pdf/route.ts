import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { parseFieldsSafe, effectiveStatus, canAccessResponseContent } from "@/lib/forms"
import { createResponseDocument } from "@/lib/forms/pdf/ResponsePdf"
import type { FormAnswers } from "@/lib/forms"

/**
 * GET /api/forms/responses/[id]/pdf — PDF export of a response.
 * Same content-visibility rule as the detail route.
 */
export const GET = withFeatureAuth(
  { feature: "forms", minAccess: "READ" },
  async (_req: NextRequest, { user }, params) => {
    const response = await prisma.formResponse.findFirst({
      where: { id: params.id, clinicId: user.clinicId },
      include: {
        formVersion: { select: { version: true, fields: true, template: { select: { name: true } } } },
        patient: { select: { name: true, referenceProfessionalId: true } },
        clinic: { select: { name: true } },
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
      return NextResponse.json({ error: "Sem permissão para ver o conteúdo desta resposta" }, { status: 403 })
    }

    const buffer = await renderToBuffer(
      createResponseDocument({
        clinicName: response.clinic.name,
        templateName: response.formVersion.template.name,
        version: response.formVersion.version,
        patientName: response.patient.name,
        status: effectiveStatus(response, new Date()),
        completedAtLabel: response.completedAt ? response.completedAt.toLocaleDateString("pt-BR") : null,
        fields: parseFieldsSafe(response.formVersion.fields),
        answers: (response.answers ?? {}) as FormAnswers,
      })
    )

    const safeName = response.patient.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="formulario-${safeName}.pdf"`,
      },
    })
  }
)
